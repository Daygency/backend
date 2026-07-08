import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentQueryDto } from './dto/list-comment-query.dto';
import { Comment, CommentTargetType } from './entities/comment.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';
import { Like, LikeType } from '../like/entities/like.entity';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';

function decodeCommentCursor(cursor: string): { t: string; i: string } {
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

function encodeCommentCursor(createdAt: Date, id: string): string {
  return encodeCursor({ t: createdAt.toISOString(), i: id });
}

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    private readonly noticeService: NoticeService,
  ) {}

  async create(userId: string, dto: CreateCommentDto) {
    await this.validateTarget(dto.targetType, dto.targetId);

    if (dto.parentId) {
      const parent = await this.commentRepository.findOne({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException('부모 댓글이 존재하지 않습니다.');
      }

      if (
        parent.targetType !== dto.targetType ||
        parent.targetId !== dto.targetId
      ) {
        throw new ForbiddenException(
          '부모 댓글과 같은 게시글에만 대댓글을 작성할 수 있습니다.',
        );
      }
    }

    const comment = this.commentRepository.create({
      content: dto.content,
      targetType: dto.targetType,
      targetId: dto.targetId,
      parentId: dto.parentId ?? null,
      user: { userId },
    });

    const saved = await this.commentRepository.save(comment);
    void this.notifyCommentCreated(saved, userId);
    return this.findOne(saved.id);
  }

  async findAll(query: ListCommentQueryDto, userId?: string) {
    await this.validateTarget(query.targetType, query.targetId);

    const limit = query.limit ?? 20;
    const qb = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.targetType = :targetType', { targetType: query.targetType })
      .andWhere('comment.targetId = :targetId', { targetId: query.targetId })
      .orderBy('comment.createdAt', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeCommentCursor(query.cursor);
      qb.andWhere(
        '(comment.createdAt > :ca OR (comment.createdAt = :ca AND comment.id > :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const comments = hasMore ? rows.slice(0, limit) : rows;
    const last = comments[comments.length - 1];
    const nextCursor =
      hasMore && last ? encodeCommentCursor(last.createdAt, last.id) : null;

    const items = await this.withLikeInfo(comments, userId);
    return { items, nextCursor, hasMore };
  }

  private async withLikeInfo(comments: Comment[], userId?: string) {
    if (comments.length === 0) return [];

    const commentIds = comments.map((comment) => comment.id);
    const likes = await this.likeRepository.find({
      where: {
        likeType: LikeType.COMMENT,
        targetId: In(commentIds),
      },
      relations: ['user'],
    });

    const countByCommentId = new Map<string, number>();
    const likedCommentIds = new Set<string>();
    for (const like of likes) {
      countByCommentId.set(
        like.targetId,
        (countByCommentId.get(like.targetId) ?? 0) + 1,
      );
      if (userId && like.user?.userId === userId) {
        likedCommentIds.add(like.targetId);
      }
    }

    return comments.map((comment) => ({
      ...comment,
      likeCount: countByCommentId.get(comment.id) ?? 0,
      isLiked: likedCommentIds.has(comment.id),
    }));
  }

  async findOne(id: string) {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    return comment;
  }

  async update(userId: string, id: string, dto: UpdateCommentDto) {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    if (comment.user?.userId !== userId) {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

    if (dto.content !== undefined) {
      comment.content = dto.content;
    }

    return this.commentRepository.save(comment);
  }

  async remove(userId: string, id: string) {
    const comment = await this.commentRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    if (comment.user?.userId !== userId) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    await this.commentRepository.softDelete({ id });

    return { success: true };
  }

  private async notifyCommentCreated(
    comment: Comment,
    commenterUserId: string,
  ): Promise<void> {
    try {
      let recipientUserId: string | undefined;
      if (comment.parentId) {
        const parent = await this.commentRepository.findOne({
          where: { id: comment.parentId },
          relations: { user: true },
        });
        recipientUserId = parent?.user?.userId;
      } else if (comment.targetType === CommentTargetType.NEWS) {
        const news = await this.newsRepository.findOne({
          where: { newsId: comment.targetId },
          relations: { user: true },
        });
        recipientUserId = news?.user?.userId;
      } else {
        const community = await this.communityRepository.findOne({
          where: { communityId: comment.targetId },
          relations: { user: true },
        });
        recipientUserId = community?.user?.userId;
      }
      if (!recipientUserId || recipientUserId === commenterUserId) {
        return;
      }

      const commenter = await this.userRepository.findOne({
        where: { userId: commenterUserId },
        select: ['name', 'activityName'],
      });
      const name = commenter?.activityName ?? commenter?.name ?? '회원';
      const preview =
        comment.content.length > 200
          ? `${comment.content.slice(0, 200)}…`
          : comment.content;
      const prefix = comment.parentId
        ? `${name}님이 대댓글을 남겼습니다: `
        : `${name}님이 댓글을 남겼습니다: `;
      const content = `${prefix}${preview}`.slice(0, 500);

      await this.noticeService.createAndDispatchPush({
        actorUserId: commenterUserId,
        targetType: NoticeTargetType.COMMENT,
        targetId: comment.id,
        content,
        recipientUserIds: [recipientUserId],
        skipPush: true,
      });
    } catch (e) {
      this.logger.error('notifyCommentCreated failed', e);
    }
  }

  private async validateTarget(
    targetType: CommentTargetType,
    targetId: string,
  ) {
    if (targetType === CommentTargetType.NEWS) {
      const news = await this.newsRepository.findOne({
        where: { newsId: targetId },
      });
      if (!news) {
        throw new NotFoundException('댓글 대상 뉴스를 찾을 수 없습니다.');
      }
      return;
    }

    const community = await this.communityRepository.findOne({
      where: { communityId: targetId },
    });
    if (!community) {
      throw new NotFoundException(
        '댓글 대상 커뮤니티 게시글을 찾을 수 없습니다.',
      );
    }
  }
}
