import {
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
        select: ['nickname', 'activityName'],
      });
      const name = liker?.activityName ?? liker?.nickname ?? '회원';
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

    const items = await this.likeRepository.find({
      where: {
        likeType: query.likeType,
        targetId: query.targetId,
      },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    return {
      count: items.length,
      items,
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
