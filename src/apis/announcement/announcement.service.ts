import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { ApplicationConfigDto } from './dto/application-config.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ListAnnouncementQueryDto } from './dto/list-announcement-query.dto';
import {
  Announcement,
  AnnouncementType,
  AnnouncementStatus,
} from './entities/announcement.entity';
import { ApplicationConfig } from './entities/application-config.entity';

/** 공고유형 enum → 한글 라벨 */
const TYPE_LABELS: Record<AnnouncementType, string> = {
  [AnnouncementType.AUDITION]: '오디션(연주자모집)',
  [AnnouncementType.COMPETITION]: '콩쿨(경연)',
  [AnnouncementType.ADMISSION_EVAL]: '입시평가회',
  [AnnouncementType.MASTERCLASS]: '마스터클래스',
  [AnnouncementType.EVENT]: '행사',
  [AnnouncementType.STAFF_RECRUIT]: '스탭구인',
  [AnnouncementType.ETC]: '기타',
};

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
    type: a.type ? TYPE_LABELS[a.type] : '기타',
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

    const announcement = this.announcementRepository.create({
      userId,
      title: dto.title,
      content: dto.content,
      deadlineAt: new Date(dto.deadlineAt),
      scheduledAt: new Date(dto.scheduledAt),
      status: dto.status ?? AnnouncementStatus.OPEN,
      address: dto.address,
      fileId: dto.fileId,
      type: dto.type ?? null,
      major: dto.major ?? null,
    });
    const saved = await this.announcementRepository.save(announcement);

    const applicationConfig = this.applicationConfigRepository.create({
      postId: saved.postId,
      ...Object.fromEntries(
        Object.entries(ac ?? {}).map(([k, v]) => [k, v ?? false]),
      ),
    });
    await this.applicationConfigRepository.save(applicationConfig);

    return toListItem(saved);
  }

  /**
   * 공고 목록 조회 (무한스크롤 + 필터)
   * - cursor: 마지막 postId (없으면 첫 페이지)
   * - limit: 페이지 크기 (기본 20, 최대 50)
   * - status, type, major: 필터 파라미터
   */
  async findList(
    query: ListAnnouncementQueryDto,
  ): Promise<AnnouncementListResponse> {
    const { cursor, limit = 20, status, type, major } = query;

    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .orderBy('announcement.postId', 'DESC')
      .take(limit + 1); // 다음 페이지 존재 여부 확인용 +1

    if (cursor) {
      qb.andWhere('announcement.postId < :cursor', { cursor });
    }
    if (status) {
      qb.andWhere('announcement.status = :status', { status });
    }
    if (type) {
      qb.andWhere('announcement.type = :type', { type });
    }
    if (major) {
      const majors = major
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      if (majors.length > 0) {
        qb.andWhere('announcement.major IN (:...majors)', { majors });
      }
    }

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((a) => ({
      postId: a.postId,
      title: a.title,
      type: a.type ? TYPE_LABELS[a.type] : '기타',
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
