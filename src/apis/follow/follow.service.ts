import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Block } from '../block/entities/block.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { Follow } from './entities/follow.entity';
import { ListFollowQueryDto } from './dto/list-follow-query.dto';

export type FollowListItemDto = {
  userId: string;
  nickname: string;
  activityName: string;
  profileImgUrl: string;
  followedAt: Date;
};

export type FollowListResponse = {
  items: FollowListItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

@Injectable()
export class FollowService {
  private readonly logger = new Logger(FollowService.name);

  constructor(
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly noticeService: NoticeService,
  ) {}

  async follow(senderId: string, receiverId: string): Promise<Follow> {
    if (senderId === receiverId) {
      throw new BadRequestException('자기 자신을 팔로우할 수 없습니다.');
    }
    const receiver = await this.userRepo.findOne({
      where: { userId: receiverId },
    });
    if (!receiver) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    if (await this.hasBlockBetween(senderId, receiverId)) {
      throw new ForbiddenException('차단 관계가 있어 팔로우할 수 없습니다.');
    }
    const existing = await this.followRepo.findOne({
      where: { senderId, receiverId },
    });
    if (existing) {
      throw new ConflictException('이미 팔로우한 사용자입니다.');
    }
    const row = this.followRepo.create({ senderId, receiverId });
    const saved = await this.followRepo.save(row);
    void this.notifyNewFollow(senderId, receiverId);
    return saved;
  }

  private async notifyNewFollow(
    senderId: string,
    receiverId: string,
  ): Promise<void> {
    try {
      const sender = await this.userRepo.findOne({
        where: { userId: senderId },
        select: ['nickname', 'activityName'],
      });
      const name = sender?.activityName ?? sender?.nickname ?? '회원';
      await this.noticeService.createAndDispatchPush({
        actorUserId: senderId,
        targetType: NoticeTargetType.FOLLOW,
        targetId: senderId,
        content: `${name}님이 나를 팔로우했습니다.`.slice(0, 500),
        recipientUserIds: [receiverId],
      });
    } catch (e) {
      this.logger.error('notifyNewFollow failed', e);
    }
  }

  async unfollow(senderId: string, receiverId: string): Promise<void> {
    const result = await this.followRepo.delete({ senderId, receiverId });
    if (result.affected === 0) {
      throw new NotFoundException('팔로우 관계가 없습니다.');
    }
  }

  /**
   * 차단 시 사용 — 두 유저 간 양방향 팔로우 행 삭제 (트랜잭션 내에서 호출)
   */
  async removeFollowsBetween(
    manager: EntityManager,
    a: string,
    b: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .delete()
      .from(Follow)
      .where(
        '(sender_id = :a AND receiver_id = :b) OR (sender_id = :b AND receiver_id = :a)',
        { a, b },
      )
      .execute();
  }

  private async hasBlockBetween(u1: string, u2: string): Promise<boolean> {
    const row = await this.blockRepo
      .createQueryBuilder('b')
      .where(
        '(b.blocker_id = :u1 AND b.blocked_id = :u2) OR (b.blocker_id = :u2 AND b.blocked_id = :u1)',
        { u1, u2 },
      )
      .getOne();
    return !!row;
  }

  /**
   * 특정 유저가 팔로우한 사람들 (sender = owner → receiver 목록)
   */
  async listFollowing(
    ownerUserId: string,
    query: ListFollowQueryDto,
  ): Promise<FollowListResponse> {
    return this.paginateFollowList(ownerUserId, query, 'following');
  }

  /**
   * 특정 유저를 팔로우한 사람들 (receiver = owner → sender 목록)
   */
  async listFollowers(
    ownerUserId: string,
    query: ListFollowQueryDto,
  ): Promise<FollowListResponse> {
    return this.paginateFollowList(ownerUserId, query, 'followers');
  }

  private async paginateFollowList(
    ownerUserId: string,
    query: ListFollowQueryDto,
    mode: 'following' | 'followers',
  ): Promise<FollowListResponse> {
    await this.ensureUserExists(ownerUserId);
    const limit = Math.min(query.limit ?? 20, 50);
    const qb = this.followRepo.createQueryBuilder('f').take(limit + 1);

    if (mode === 'following') {
      qb.where('f.senderId = :oid', { oid: ownerUserId })
        .orderBy('f.createdAt', 'DESC')
        .addOrderBy('f.receiverId', 'DESC');
      if (query.cursor) {
        const { t, p } = this.decodeFollowCursor(query.cursor);
        qb.andWhere(
          '(f.createdAt < :cAt OR (f.createdAt = :cAt AND f.receiverId < :cPeer))',
          { cAt: new Date(t), cPeer: p },
        );
      }
    } else {
      qb.where('f.receiverId = :oid', { oid: ownerUserId })
        .orderBy('f.createdAt', 'DESC')
        .addOrderBy('f.senderId', 'DESC');
      if (query.cursor) {
        const { t, p } = this.decodeFollowCursor(query.cursor);
        qb.andWhere(
          '(f.createdAt < :cAt OR (f.createdAt = :cAt AND f.senderId < :cPeer))',
          { cAt: new Date(t), cPeer: p },
        );
      }
    }

    const page = await qb.getMany();
    const hasMore = page.length > limit;
    const slice = page.slice(0, limit);

    if (slice.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const peerIds = slice.map((f) =>
      mode === 'following' ? f.receiverId : f.senderId,
    );
    const users = await this.userRepo.find({
      where: { userId: In(peerIds) },
      select: ['userId', 'nickname', 'activityName', 'profileImgUrl'],
    });
    const userMap = new Map(users.map((u) => [u.userId, u]));

    const items: FollowListItemDto[] = slice.map((f) => {
      const peerId = mode === 'following' ? f.receiverId : f.senderId;
      const u = userMap.get(peerId);
      return {
        userId: peerId,
        nickname: u?.nickname ?? '알 수 없음',
        activityName: u?.activityName ?? '',
        profileImgUrl: u?.profileImgUrl ?? '',
        followedAt: f.createdAt,
      };
    });

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = slice[slice.length - 1];
      const peerId = mode === 'following' ? last.receiverId : last.senderId;
      nextCursor = this.encodeFollowCursor(last.createdAt, peerId);
    }

    return { items, nextCursor, hasMore };
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const exists = await this.userRepo.exist({ where: { userId } });
    if (!exists) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
  }

  private decodeFollowCursor(cursor: string): { t: string; p: string } {
    try {
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const o = JSON.parse(json) as { t?: string; p?: string };
      if (!o?.t || !o?.p) {
        throw new Error();
      }
      return { t: o.t, p: o.p };
    } catch {
      throw new BadRequestException('유효하지 않은 커서입니다.');
    }
  }

  private encodeFollowCursor(createdAt: Date, peerColumnValue: string): string {
    return Buffer.from(
      JSON.stringify({ t: createdAt.toISOString(), p: peerColumnValue }),
    ).toString('base64url');
  }
}
