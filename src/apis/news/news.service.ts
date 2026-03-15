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
import { News } from './entities/news.entity';

export interface NewsListResponse {
  items: Array<{
    newsId: string;
    title: string;
    place: string;
    startedAt: Date;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
  ) {}

  /**
   * 공연소식 작성
   */
  async create(
    userId: string,
    dto: CreateNewsDto,
  ): Promise<{
    newsId: string;
    title: string;
    place: string;
    startedAt: Date;
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
      file: { fileId: dto.fileId },
    });
    const saved = await this.newsRepository.save(news);
    return {
      newsId: saved.newsId,
      title: saved.title,
      place: saved.place,
      startedAt: saved.startedAt,
    };
  }

  /**
   * 공연소식 목록 조회 (무한스크롤)
   */
  async findList(query: ListNewsQueryDto): Promise<NewsListResponse> {
    const { cursor, limit = 20 } = query;

    const qb = this.newsRepository
      .createQueryBuilder('news')
      .orderBy('news.newsId', 'DESC')
      .take(limit + 1);

    if (cursor) {
      qb.andWhere('news.newsId < :cursor', { cursor });
    }

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((n) => ({
      newsId: n.newsId,
      title: n.title,
      place: n.place,
      startedAt: n.startedAt,
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

    return {
      ...news,
      isMine,
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
