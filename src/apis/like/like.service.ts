import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Like, LikeType } from './entities/like.entity';
import { CreateLikeDto } from './dto/create-like.dto';
import { ListLikeQueryDto } from './dto/list-like-query.dto';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { Announcement } from '../announcement/entities/announcement.entity';
import { Comment } from '../comment/entities/comment.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';

function decodeLikeCursor(cursor: string): { t: string; i: string } {
  try {
    const parsed = decodeCursor(cursor) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') {
      throw new Error('invalid cursor shape');
    }
    return { t: parsed.t, i: parsed.i };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

function encodeLikeCursor(createdAt: Date, id: string): string {
  return encodeCursor({ t: createdAt.toISOString(), i: id });
}

@Injectable()
export class LikeService {
  private readonly logger = new Logger(LikeService.name);

  constructor(
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly noticeService: NoticeService,
  ) {}

  async create(userId: string, dto: CreateLikeDto) {
    await this.validateTarget(dto.likeType, dto.targetId);

    const exists = await this.likeRepository.findOne({
      where: {
        likeType: dto.likeType,
        targetId: dto.targetId,
        user: { userId },
      },
      relations: ['user'],
    });

    if (exists) {
      throw new ConflictException('이미 좋아요한 대상입니다.');
    }

    const like = this.likeRepository.create({
      likeType: dto.likeType,
      targetId: dto.targetId,
      user: { userId },
    });

    const saved = await this.likeRepository.save(like);
    void this.notifyLikeCreated(userId, saved);
    return saved;
  }

  private likeTargetLabel(likeType: LikeType): string {
    switch (likeType) {
      case LikeType.NEWS:
        return '뉴스';
      case LikeType.COMMUNITY:
        return '게시글';
      case LikeType.ANNOUNCEMENT:
        return '공고';
      case LikeType.COMMENT:
        return '댓글';
      default:
        return '게시글';
    }
  }

  private async resolveLikeTargetOwnerId(
    likeType: LikeType,
    targetId: string,
  ): Promise<string | undefined> {
    if (likeType === LikeType.NEWS) {
      const row = await this.newsRepository.findOne({
        where: { newsId: targetId },
        relations: { user: true },
      });
      return row?.user?.userId;
    }
    if (likeType === LikeType.COMMUNITY) {
      const row = await this.communityRepository.findOne({
        where: { communityId: targetId },
        relations: { user: true },
      });
      return row?.user?.userId;
    }
    if (likeType === LikeType.ANNOUNCEMENT) {
      const row = await this.announcementRepository.findOne({
        where: { postId: targetId },
      });
      return row?.userId;
    }
    const row = await this.commentRepository.findOne({
      where: { id: targetId },
      relations: { user: true },
    });
    return row?.user?.userId;
  }

  private async notifyLikeCreated(
    likerUserId: string,
    like: Like,
  ): Promise<void> {
    try {
      const ownerId = await this.resolveLikeTargetOwnerId(
        like.likeType,
        like.targetId,
      );
      if (!ownerId || ownerId === likerUserId) {
        return;
      }

      const liker = await this.userRepository.findOne({
        where: { userId: likerUserId },
        select: ['name', 'activityName'],
      });
      const name = liker?.activityName ?? liker?.name ?? '회원';
      const label = this.likeTargetLabel(like.likeType);
      const content = `${name}님이 내 ${label}에 좋아요를 눌렀습니다.`.slice(
        0,
        500,
      );

      await this.noticeService.createAndDispatchPush({
        actorUserId: likerUserId,
        targetType: NoticeTargetType.LIKE,
        targetId: like.targetId,
        likeKind: like.likeType,
        content,
        recipientUserIds: [ownerId],
      });
    } catch (e) {
      this.logger.error('notifyLikeCreated failed', e);
    }
  }

  async findAll(query: ListLikeQueryDto) {
    await this.validateTarget(query.likeType, query.targetId);

    const limit = query.limit ?? 8;
    const qb = this.likeRepository
      .createQueryBuilder('like')
      .leftJoinAndSelect('like.user', 'user')
      .where('like.likeType = :likeType', { likeType: query.likeType })
      .andWhere('like.targetId = :targetId', { targetId: query.targetId })
      .orderBy('like.createdAt', 'ASC')
      .addOrderBy('like.id', 'ASC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeLikeCursor(query.cursor);
      qb.andWhere(
        '(like.createdAt > :ca OR (like.createdAt = :ca AND like.id > :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const [rows, count] = await Promise.all([
      qb.getMany(),
      this.likeRepository.count({
        where: { likeType: query.likeType, targetId: query.targetId },
      }),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeLikeCursor(last.createdAt, last.id) : null;

    return {
      count,
      items,
      nextCursor,
      hasMore,
    };
  }

  async findOne(id: string) {
    const like = await this.likeRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!like) {
      throw new NotFoundException('좋아요를 찾을 수 없습니다.');
    }

    return like;
  }

  async remove(userId: string, id: string) {
    const like = await this.likeRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!like) {
      throw new NotFoundException('좋아요를 찾을 수 없습니다.');
    }

    if (like.user?.userId !== userId) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    await this.likeRepository.delete({ id });

    return { success: true };
  }

  async removeByTarget(userId: string, likeType: LikeType, targetId: string) {
    await this.validateTarget(likeType, targetId);

    const like = await this.likeRepository.findOne({
      where: {
        likeType,
        targetId,
        user: { userId },
      },
      relations: ['user'],
    });

    if (!like) {
      throw new NotFoundException('좋아요를 찾을 수 없습니다.');
    }

    await this.likeRepository.delete({ id: like.id });

    return { success: true };
  }

  private async validateTarget(likeType: LikeType, targetId: string) {
    if (likeType === LikeType.NEWS) {
      const news = await this.newsRepository.findOne({
        where: { newsId: targetId },
      });
      if (!news) {
        throw new NotFoundException('좋아요 대상 뉴스를 찾을 수 없습니다.');
      }
      return;
    }

    if (likeType === LikeType.COMMUNITY) {
      const community = await this.communityRepository.findOne({
        where: { communityId: targetId },
      });
      if (!community) {
        throw new NotFoundException(
          '좋아요 대상 커뮤니티 게시글을 찾을 수 없습니다.',
        );
      }
      return;
    }

    if (likeType === LikeType.ANNOUNCEMENT) {
      const announcement = await this.announcementRepository.findOne({
        where: { postId: targetId },
      });
      if (!announcement) {
        throw new NotFoundException('좋아요 대상 공고를 찾을 수 없습니다.');
      }
      return;
    }

    const comment = await this.commentRepository.findOne({
      where: { id: targetId },
    });
    if (!comment) {
      throw new NotFoundException('좋아요 대상 댓글을 찾을 수 없습니다.');
    }
  }
}
