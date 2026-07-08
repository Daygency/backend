import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Scrap, ScrapTargetType } from './entities/scrap.entity';
import { CreateScrapDto } from './dto/create-scrap.dto';
import { ListScrapQueryDto } from './dto/list-scrap-query.dto';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { Announcement } from '../announcement/entities/announcement.entity';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';

function decodeScrapCursor(cursor: string): { t: string; i: string } {
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

function encodeScrapCursor(createdAt: Date, id: string): string {
  return encodeCursor({ t: createdAt.toISOString(), i: id });
}

@Injectable()
export class ScrapService {
  constructor(
    @InjectRepository(Scrap)
    private readonly scrapRepository: Repository<Scrap>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  async create(userId: string, dto: CreateScrapDto) {
    await this.validateTarget(dto.targetType, dto.targetId);

    const exists = await this.scrapRepository.findOne({
      where: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        user: { userId },
      },
      relations: ['user'],
    });

    if (exists) {
      throw new ConflictException('이미 스크랩한 대상입니다.');
    }

    const scrap = this.scrapRepository.create({
      targetType: dto.targetType,
      targetId: dto.targetId,
      user: { userId },
    });

    return this.scrapRepository.save(scrap);
  }

  async findAll(query: ListScrapQueryDto) {
    await this.validateTarget(query.targetType, query.targetId);

    const limit = query.limit ?? 20;
    const qb = this.scrapRepository
      .createQueryBuilder('scrap')
      .leftJoinAndSelect('scrap.user', 'user')
      .where('scrap.targetType = :targetType', { targetType: query.targetType })
      .andWhere('scrap.targetId = :targetId', { targetId: query.targetId })
      .orderBy('scrap.createdAt', 'ASC')
      .addOrderBy('scrap.id', 'ASC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeScrapCursor(query.cursor);
      qb.andWhere(
        '(scrap.createdAt > :ca OR (scrap.createdAt = :ca AND scrap.id > :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const [rows, count] = await Promise.all([
      qb.getMany(),
      this.scrapRepository.count({
        where: { targetType: query.targetType, targetId: query.targetId },
      }),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeScrapCursor(last.createdAt, last.id) : null;

    return {
      count,
      items,
      nextCursor,
      hasMore,
    };
  }

  async findOne(id: string) {
    const scrap = await this.scrapRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!scrap) {
      throw new NotFoundException('스크랩을 찾을 수 없습니다.');
    }

    return scrap;
  }

  async remove(userId: string, id: string) {
    const scrap = await this.scrapRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!scrap) {
      throw new NotFoundException('스크랩을 찾을 수 없습니다.');
    }

    if (scrap.user?.userId !== userId) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    await this.scrapRepository.delete({ id });

    return { success: true };
  }

  async removeByTarget(userId: string, targetType: ScrapTargetType, targetId: string) {
    await this.validateTarget(targetType, targetId);

    const scrap = await this.scrapRepository.findOne({
      where: {
        targetType,
        targetId,
        user: { userId },
      },
      relations: ['user'],
    });

    if (!scrap) {
      throw new NotFoundException('스크랩을 찾을 수 없습니다.');
    }

    await this.scrapRepository.delete({ id: scrap.id });

    return { success: true };
  }

  private async validateTarget(targetType: ScrapTargetType, targetId: string) {
    if (targetType === ScrapTargetType.NEWS) {
      const news = await this.newsRepository.findOne({ where: { newsId: targetId } });
      if (!news) {
        throw new NotFoundException('스크랩 대상 뉴스를 찾을 수 없습니다.');
      }
      return;
    }

    if (targetType === ScrapTargetType.COMMUNITY) {
      const community = await this.communityRepository.findOne({
        where: { communityId: targetId },
      });
      if (!community) {
        throw new NotFoundException('스크랩 대상 커뮤니티 게시글을 찾을 수 없습니다.');
      }
      return;
    }

    const announcement = await this.announcementRepository.findOne({
      where: { postId: targetId },
    });
    if (!announcement) {
      throw new NotFoundException('스크랩 대상 공고를 찾을 수 없습니다.');
    }
  }
}
