import type { Express } from 'express';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { toLikePattern } from '../../common/escape-like-pattern.util';
import { News } from './entities/news.entity';
import { Like, LikeType } from '../like/entities/like.entity';
import { Comment, CommentTargetType } from '../comment/entities/comment.entity';
import { File, FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { NewsFileService } from './news-file.service';

export interface NewsListResponse {
  items: Array<{
    newsId: string;
    title: string;
    place: string;
    startedAt: Date;
    likeCount: number;
    commentCount: number;
    /** `file.type`+`news_id` 첨부 중 `order` 최소 1장, 없으면 글의 `file_id` 대표 이미지 */
    thumbnailUrl: string | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly fileService: FileService,
    private readonly newsFileService: NewsFileService,
  ) {}

  /**
   * 공연소식 작성 (`files`가 있으면 S3 + `file` 테이블에 연결, 첫 장을 대표 `file_id`로 설정 가능)
   */
  async create(
    userId: string,
    dto: CreateNewsDto,
    files?: Express.Multer.File[],
  ): Promise<{
    newsId: string;
    title: string;
    place: string;
    startedAt: Date;
    attachments: Array<{
      fileId: string;
      imgUrl: string;
      sortOrder: number;
    }>;
  }> {
    const news = this.newsRepository.create({
      title: dto.title,
      content: dto.content,
      place: dto.place,
      ticketPrice: dto.ticketPrice ?? null,
      startedAt: new Date(dto.startedAt),
      endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
      contact: dto.contact,
      user: { userId },
      file: dto.fileId ? { fileId: dto.fileId } : null,
    });
    const saved = await this.newsRepository.save(news);

    let uploaded: File[] = [];
    if (files?.length) {
      uploaded = await this.newsFileService.attachFilesToPost(
        saved.newsId,
        files.map((f, i) => ({
          buffer: f.buffer,
          originalName: f.originalname,
          contentType: f.mimetype,
          sortOrder: i,
        })),
      );
      const primaryFileId = dto.fileId ?? uploaded[0]?.fileId;
      if (primaryFileId) {
        await this.newsRepository.save({
          ...saved,
          file: { fileId: primaryFileId } as File,
        });
      }
    }

    const attachments = uploaded.map((f) => ({
      fileId: f.fileId,
      imgUrl: f.imgUrl,
      sortOrder: f.sortOrder,
    }));

    return {
      newsId: saved.newsId,
      title: saved.title,
      place: saved.place,
      startedAt: saved.startedAt,
      attachments,
    };
  }

  /**
   * 공연소식 목록 조회 (무한스크롤)
   */
  async findList(query: ListNewsQueryDto): Promise<NewsListResponse> {
    const { cursor, limit = 20, q } = query;
    const likeQ = q ? toLikePattern(q) : null;

    const qb = this.newsRepository
      .createQueryBuilder('news')
      .leftJoinAndSelect('news.file', 'file')
      .orderBy('news.newsId', 'DESC')
      .take(limit + 1);

    if (cursor) {
      qb.andWhere('news.newsId < :cursor', { cursor });
    }
    if (likeQ) {
      qb.andWhere(
        '(news.title LIKE :likeQ ESCAPE \'\\\\\' OR news.place LIKE :likeQ ESCAPE \'\\\\\')',
        { likeQ },
      );
    }

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const newsIds = sliced.map((n) => n.newsId);

    const [likeCounts, commentCounts] = await Promise.all([
      newsIds.length
        ? this.likeRepository
            .createQueryBuilder('l')
            .select('l.targetId', 'targetId')
            .addSelect('COUNT(*)', 'count')
            .where('l.likeType = :likeType', { likeType: LikeType.NEWS })
            .andWhere('l.targetId IN (:...newsIds)', { newsIds })
            .groupBy('l.targetId')
            .getRawMany<{ targetId: string; count: string }>()
        : Promise.resolve([]),
      newsIds.length
        ? this.commentRepository
            .createQueryBuilder('c')
            .select('c.targetId', 'targetId')
            .addSelect('COUNT(*)', 'count')
            .where('c.targetType = :targetType', {
              targetType: CommentTargetType.NEWS,
            })
            .andWhere('c.targetId IN (:...newsIds)', { newsIds })
            .groupBy('c.targetId')
            .getRawMany<{ targetId: string; count: string }>()
        : Promise.resolve([]),
    ]);

    const likeCountMap = new Map(
      likeCounts.map((row) => [row.targetId, Number(row.count)]),
    );
    const commentCountMap = new Map(
      commentCounts.map((row) => [row.targetId, Number(row.count)]),
    );

    const thumbMap =
      await this.fileService.getSmallestOrderThumbnailByTargetIds(
        FileTargetType.NEWS,
        newsIds,
      );

    const items = sliced.map((n) => ({
      newsId: n.newsId,
      title: n.title,
      place: n.place,
      startedAt: n.startedAt,
      likeCount: likeCountMap.get(n.newsId) ?? 0,
      commentCount: commentCountMap.get(n.newsId) ?? 0,
      thumbnailUrl:
        thumbMap.get(n.newsId)?.imgUrl ?? n.file?.imgUrl ?? null,
    }));

    const nextCursor = hasMore ? items[items.length - 1].newsId : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * 공연소식 상세 조회. 로그인 시 isMine 포함
   */
  async findOne(newsId: string, currentUserId?: string) {
    const news = await this.newsRepository.findOne({
      where: { newsId },
      relations: ['user', 'file'],
    });
    if (!news) {
      throw new NotFoundException('공연소식을 찾을 수 없습니다.');
    }
    const authorId = (news.user?.userId ?? '').trim().toLowerCase();
    const requestUserId = (currentUserId ?? '').trim().toLowerCase();
    const isMine = requestUserId.length > 0 && authorId === requestUserId;

    await this.newsRepository.increment({ newsId }, 'viewCount', 1);
    news.viewCount += 1;

    const [likeCount, commentCount] = await Promise.all([
      this.likeRepository.count({
        where: {
          likeType: LikeType.NEWS,
          targetId: newsId,
        },
      }),
      this.commentRepository.count({
        where: {
          targetType: CommentTargetType.NEWS,
          targetId: newsId,
        },
      }),
    ]);

    return {
      ...news,
      isMine,
      likeCount,
      commentCount,
    };
  }

  /**
   * 공연소식 수정. 작성자만 수정 가능
   */
  async update(
    userId: string,
    newsId: string,
    dto: UpdateNewsDto,
  ): Promise<{
    newsId: string;
    title: string;
    place: string;
    startedAt: Date;
  }> {
    const news = await this.newsRepository.findOne({
      where: { newsId },
      relations: ['user'],
    });
    if (!news) {
      throw new NotFoundException('공연소식을 찾을 수 없습니다.');
    }
    if (news.user?.userId !== userId) {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

    if (dto.title !== undefined) news.title = dto.title;
    if (dto.content !== undefined) news.content = dto.content;
    if (dto.place !== undefined) news.place = dto.place;
    if (dto.ticketPrice !== undefined) news.ticketPrice = dto.ticketPrice ?? null;
    if (dto.startedAt !== undefined)
      news.startedAt = new Date(dto.startedAt);
    if (dto.endedAt !== undefined)
      news.endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    if (dto.contact !== undefined) news.contact = dto.contact;
    if (dto.fileId !== undefined) news.file = { fileId: dto.fileId } as any;

    await this.newsRepository.save(news);

    return {
      newsId: news.newsId,
      title: news.title,
      place: news.place,
      startedAt: news.startedAt,
    };
  }

  /**
   * 공연소식 삭제. 작성자만 삭제 가능
   */
  async remove(userId: string, newsId: string): Promise<void> {
    const news = await this.newsRepository.findOne({
      where: { newsId },
      relations: ['user'],
    });
    if (!news) {
      throw new NotFoundException('공연소식을 찾을 수 없습니다.');
    }
    if (news.user?.userId !== userId) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    await this.newsRepository.delete({ newsId });
  }
}
