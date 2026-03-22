import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Block } from '../block/entities/block.entity';
import { Follow } from './entities/follow.entity';

@Injectable()
export class FollowService {
  constructor(
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
      throw new ForbiddenException(
        '차단 관계가 있어 팔로우할 수 없습니다.',
      );
    }
    const existing = await this.followRepo.findOne({
      where: { senderId, receiverId },
    });
    if (existing) {
      throw new ConflictException('이미 팔로우한 사용자입니다.');
    }
    const row = this.followRepo.create({ senderId, receiverId });
    return this.followRepo.save(row);
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
}
