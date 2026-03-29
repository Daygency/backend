import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentQueryDto } from './dto/list-comment-query.dto';
import { Comment, CommentTargetType } from './entities/comment.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';

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
    return saved;
  }

  async findAll(query: ListCommentQueryDto) {
    await this.validateTarget(query.targetType, query.targetId);

    return this.commentRepository.find({
      where: {
        targetType: query.targetType,
        targetId: query.targetId,
      },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
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
        select: ['nickname', 'activityName'],
      });
      const name = commenter?.activityName ?? commenter?.nickname ?? '회원';
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
