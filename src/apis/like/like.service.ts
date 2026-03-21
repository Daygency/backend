import {
  ConflictException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class LikeService {
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

    return this.likeRepository.save(like);
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
      const news = await this.newsRepository.findOne({ where: { newsId: targetId } });
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
        throw new NotFoundException('좋아요 대상 커뮤니티 게시글을 찾을 수 없습니다.');
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

    const comment = await this.commentRepository.findOne({ where: { id: targetId } });
    if (!comment) {
      throw new NotFoundException('좋아요 대상 댓글을 찾을 수 없습니다.');
    }
  }
}
