import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ListAnnouncementQueryDto } from './dto/list-announcement-query.dto';
import { Announcement } from './entities/announcement.entity';

export interface AnnouncementListResponse {
  items: Array<{
    postId: string;
    title: string;
    deadlineAt: Date;
    scheduledAt: Date;
    status: string;
    address: string;
    thumbnailUrl: string | null;
    userNickname?: string;
    userActivityName?: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  create(createAnnouncementDto: CreateAnnouncementDto) {
    return 'This action adds a new announcement';
  }

  /**
   * 공고 목록 조회 (무한스크롤 + 필터)
   * - cursor: 마지막 postId (없으면 첫 페이지)
   * - limit: 페이지 크기 (기본 20, 최대 50)
   * - status, type, major: 필터 파라미터
   */
  async findList(query: ListAnnouncementQueryDto): Promise<AnnouncementListResponse> {
    const { cursor, limit = 20, status, type, major } = query;

    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.file', 'file')
      .leftJoinAndSelect('announcement.user', 'user')
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
      const majors = major.split(',').map((m) => m.trim()).filter(Boolean);
      if (majors.length > 0) {
        qb.andWhere('announcement.major IN (:...majors)', { majors });
      }
    }

    const rows = await qb.getMany();

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((a) => ({
      postId: a.postId,
      title: a.title,
      deadlineAt: a.deadlineAt,
      scheduledAt: a.scheduledAt,
      status: a.status,
      address: a.address,
      thumbnailUrl: a.file?.imgUrl ?? null,
      userNickname: (a.user as { nickname?: string })?.nickname,
      userActivityName: (a.user as { activityName?: string })?.activityName,
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

  update(id: string, updateAnnouncementDto: UpdateAnnouncementDto) {
    return `This action updates a #${id} announcement`;
  }

  remove(id: string) {
    return `This action removes a #${id} announcement`;
  }
}
