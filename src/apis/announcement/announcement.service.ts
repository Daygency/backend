import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { ApplicationConfigDto } from './dto/application-config.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ListAnnouncementQueryDto } from './dto/list-announcement-query.dto';
import {
  Announcement,
  AnnouncementStatus,
} from './entities/announcement.entity';
import { AnnouncementCategory } from './entities/announcement-category.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { Major } from '../major/entities/major.entity';

function calcDDay(deadlineAt: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineAt);
  deadline.setHours(0, 0, 0, 0);
  const diffMs = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `D-${diffDays}`;
  if (diffDays === 0) return 'D-Day';
  return '마감';
}

export interface AnnouncementListResponse {
  items: Array<{
    postId: string;
    title: string;
    type: string;
    isRecruiting: boolean;
    dDay: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

/** 공고 → 목록 아이템 형태로 변환 */
function toListItem(a: Announcement) {
  return {
    postId: a.postId,
    title: a.title,
    type: a.category?.name ?? '기타',
    isRecruiting: a.status === AnnouncementStatus.OPEN,
    dDay: calcDDay(a.deadlineAt),
  };
}

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(ApplicationConfig)
    private readonly applicationConfigRepository: Repository<ApplicationConfig>,
    @InjectRepository(Major)
    private readonly majorRepository: Repository<Major>,
    @InjectRepository(AnnouncementCategory)
    private readonly categoryRepository: Repository<AnnouncementCategory>,
  ) {}

  /**
   * 모집공고 작성 (announcement + application_config 함께 저장)
   * 반환: 목록 아이템 형태
   */
  async create(
    userId: string,
    dto: CreateAnnouncementDto,
  ): Promise<{
    postId: string;
    title: string;
    type: string;
    isRecruiting: boolean;
    dDay: string;
  }> {
    const ac: ApplicationConfigDto = dto.applicationConfig;

    const category = await this.categoryRepository.findOne({
      where: { categoryId: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('공고 유형을 찾을 수 없습니다.');
    }

    let majors: Major[] = [];
    if (dto.majorIds?.length) {
      majors = await this.majorRepository.find({
        where: { majorId: In(dto.majorIds) },
      });
    }

    const announcement = this.announcementRepository.create({
      userId,
      title: dto.title,
      content: dto.content,
      deadlineAt: new Date(dto.deadlineAt),
      scheduledAt: new Date(dto.scheduledAt),
      status: dto.status ?? AnnouncementStatus.OPEN,
      address: dto.address,
      fileId: dto.fileId ?? null,
      category,
      majors,
    });
    const saved = await this.announcementRepository.save(announcement);

    const applicationConfig = this.applicationConfigRepository.create({
      postId: saved.postId,
      ...Object.fromEntries(
        Object.entries(ac ?? {}).map(([k, v]) => [k, v ?? false]),
      ),
    });
    await this.applicationConfigRepository.save(applicationConfig);

    const withCategory = await this.announcementRepository.findOne({
      where: { postId: saved.postId },
      relations: ['category'],
    });
    return toListItem(withCategory ?? saved);
  }

  /**
   * 공고 유형(announcement_category) 목록 조회
   * 공고 작성/필터 시 사용하는 카테고리 목록 반환
   */
  async findAllCategories(): Promise<
    Array<{ categoryId: string; name: string }>
  > {
    const categories = await this.categoryRepository.find({
      order: { name: 'ASC' },
    });
    return categories.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
    }));
  }

  /**
   * 공고 목록 조회 (무한스크롤 + 필터)
   * - cursor: 마지막 postId (없으면 첫 페이지)
   * - limit: 페이지 크기 (기본 20, 최대 50)
   * - status, categoryId, majorIds: 필터 파라미터
   */
  async findList(
    query: ListAnnouncementQueryDto,
  ): Promise<AnnouncementListResponse> {
    const {
      cursor,
      limit = 20,
      status,
      categoryId,
      majorIds: majorIdsStr,
    } = query;

    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.category', 'category')
      .orderBy('announcement.postId', 'DESC')
      .take(limit + 1); // 다음 페이지 존재 여부 확인용 +1

    if (cursor) {
      qb.andWhere('announcement.postId < :cursor', { cursor });
    }
    if (status) {
      qb.andWhere('announcement.status = :status', { status });
    }
    if (categoryId) {
      qb.andWhere('category.categoryId = :categoryId', {
        categoryId: categoryId as string,
      });
    }
    if (majorIdsStr) {
      const str = majorIdsStr as string;
      const majorIds: string[] = str
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0);
      if (majorIds.length > 0) {
        qb.innerJoin('announcement.majors', 'am')
          .andWhere('am.majorId IN (:...majorIds)', { majorIds })
          .distinct(true);
      }
    }

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((a) => ({
      postId: a.postId,
      title: a.title,
      type: a.category?.name ?? '기타',
      isRecruiting: a.status === AnnouncementStatus.OPEN,
      dDay: calcDDay(a.deadlineAt),
    }));

    const nextCursor = hasMore ? items[items.length - 1].postId : null;

    return { items, nextCursor, hasMore };
  }

  findAll() {
    return `This action returns all announcement`;
  }

  findOne(id: string) {
    return this.announcementRepository.findOne({ where: { postId: id } });
  }

  update(id: string, dto: UpdateAnnouncementDto) {
    void dto; // TODO: implement update
    return `This action updates a #${id} announcement`;
  }

  remove(id: string) {
    return `This action removes a #${id} announcement`;
  }
}
