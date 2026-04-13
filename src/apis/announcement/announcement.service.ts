import type { Express } from 'express';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { ApplicationConfigDto } from './dto/application-config.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ListAnnouncementQueryDto } from './dto/list-announcement-query.dto';
import {
  Announcement,
  AnnouncementPriceType,
  AnnouncementStatus,
} from './entities/announcement.entity';
import { AnnouncementCategory } from './entities/announcement-category.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { Major } from '../major/entities/major.entity';
import { File } from '../file/entities/file.entity';
import { AnnouncementFileService } from './announcement-file.service';
import { Application } from '../application/entities/application.entity';

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
    priceType: AnnouncementPriceType;
    /** 금액(원), 0 이상 */
    price: number;
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
    priceType: a.priceType,
    price: a.price,
  };
}

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(ApplicationConfig)
    private readonly applicationConfigRepository: Repository<ApplicationConfig>,
    @InjectRepository(Major)
    private readonly majorRepository: Repository<Major>,
    @InjectRepository(AnnouncementCategory)
    private readonly categoryRepository: Repository<AnnouncementCategory>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    private readonly announcementFileService: AnnouncementFileService,
  ) {}

  /**
   * 모집공고 작성 (announcement + application_config 함께 저장)
   * 반환: 목록 아이템 형태
   */
  async create(
    userId: string,
    dto: CreateAnnouncementDto,
    files?: Express.Multer.File[],
  ): Promise<{
    postId: string;
    title: string;
    type: string;
    isRecruiting: boolean;
    dDay: string;
    priceType: AnnouncementPriceType;
    price: number;
    attachments: Array<{
      fileId: string;
      imgUrl: string;
      sortOrder: number;
    }>;
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
      priceType: dto.priceType ?? AnnouncementPriceType.FREE,
      price: dto.price ?? 0,
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

    let uploaded: File[] = [];
    if (files?.length) {
      uploaded = await this.announcementFileService.attachFilesToPost(
        saved.postId,
        files.map((f, i) => ({
          buffer: f.buffer,
          originalName: f.originalname,
          contentType: f.mimetype,
          sortOrder: i,
        })),
      );
      const primaryFileId = dto.fileId ?? uploaded[0]?.fileId;
      if (primaryFileId) {
        await this.announcementRepository.update(
          { postId: saved.postId },
          { fileId: primaryFileId },
        );
      }
    }

    const withCategory = await this.announcementRepository.findOne({
      where: { postId: saved.postId },
      relations: ['category'],
    });
    const list = toListItem(withCategory ?? saved);
    return {
      ...list,
      attachments: uploaded.map((f) => ({
        fileId: f.fileId,
        imgUrl: f.imgUrl,
        sortOrder: f.sortOrder,
      })),
    };
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
        categoryId: categoryId,
      });
    }
    if (majorIdsStr) {
      const str = majorIdsStr;
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
      priceType: a.priceType,
      price: a.price,
    }));

    const nextCursor = hasMore ? items[items.length - 1].postId : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * 내가 작성한 모집공고 목록 (무한스크롤 + 필터, findList와 동일한 쿼리 파라미터)
   */
  async findMyList(
    userId: string,
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
      .where('announcement.userId = :userId', { userId })
      .orderBy('announcement.postId', 'DESC')
      .take(limit + 1);

    if (cursor) {
      qb.andWhere('announcement.postId < :cursor', { cursor });
    }
    if (status) {
      qb.andWhere('announcement.status = :status', { status });
    }
    if (categoryId) {
      qb.andWhere('category.categoryId = :categoryId', {
        categoryId: categoryId,
      });
    }
    if (majorIdsStr) {
      const str = majorIdsStr;
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
      priceType: a.priceType,
      price: a.price,
    }));

    const nextCursor = hasMore ? items[items.length - 1].postId : null;

    return { items, nextCursor, hasMore };
  }

  findAll() {
    return `This action returns all announcement`;
  }

  /**
   * 공고 상세 조회.
   * currentUserId가 있으면 isMine 필드 반환 (내가 쓴 글인지 여부)
   */
  async findOne(id: string, currentUserId?: string) {
    const announcement = await this.announcementRepository.findOne({
      where: { postId: id },
      relations: ['category', 'majors', 'applicationConfig'],
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    const authorId = (announcement.userId ?? '').trim().toLowerCase();
    const requestUserId = (currentUserId ?? '').trim().toLowerCase();
    const isMine = requestUserId.length > 0 && authorId === requestUserId;
    // currentUserId가 undefined이면 Authorization 미전송 → isMine 항상 false
    this.logger.log(
      `[공고 상세] postId=${id}, currentUserId=${currentUserId ?? 'undefined'}, authorId=${authorId}, isMine=${isMine}`,
    );
    return {
      ...announcement,
      isMine,
    };
  }

  /**
   * 모집공고 수정. 작성자만 수정 가능.
   * 반환: 목록 아이템 형태 (create와 동일)
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<{
    postId: string;
    title: string;
    type: string;
    isRecruiting: boolean;
    dDay: string;
    priceType: AnnouncementPriceType;
    price: number;
  }> {
    const announcement = await this.announcementRepository.findOne({
      where: { postId: id },
      relations: ['category', 'majors'],
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.userId !== userId) {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

    const applicationCount = await this.applicationRepository.count({
      where: { postId: id },
    });
    if (applicationCount > 0) {
      throw new ForbiddenException(
        '지원자가 있는 공고는 수정할 수 없습니다.',
      );
    }

    if (dto.title !== undefined) announcement.title = dto.title;
    if (dto.content !== undefined) announcement.content = dto.content;
    if (dto.deadlineAt !== undefined)
      announcement.deadlineAt = new Date(dto.deadlineAt);
    if (dto.scheduledAt !== undefined)
      announcement.scheduledAt = new Date(dto.scheduledAt);
    if (dto.status !== undefined) announcement.status = dto.status;
    if (dto.address !== undefined) announcement.address = dto.address;
    if (dto.priceType !== undefined) announcement.priceType = dto.priceType;
    if (dto.price !== undefined) announcement.price = dto.price;
    if (dto.fileId !== undefined) announcement.fileId = dto.fileId ?? null;

    if (dto.categoryId !== undefined) {
      const category = await this.categoryRepository.findOne({
        where: { categoryId: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('공고 유형을 찾을 수 없습니다.');
      }
      announcement.category = category;
    }

    if (dto.majorIds !== undefined) {
      announcement.majors =
        dto.majorIds.length > 0
          ? await this.majorRepository.find({
              where: { majorId: In(dto.majorIds) },
            })
          : [];
    }

    await this.announcementRepository.save(announcement);

    if (dto.applicationConfig !== undefined) {
      let config = await this.applicationConfigRepository.findOne({
        where: { postId: id },
      });
      const ac = dto.applicationConfig;
      const merged = Object.fromEntries(
        Object.entries(ac).map(([k, v]) => [k, v ?? false]),
      );
      if (config) {
        Object.assign(config, merged);
        await this.applicationConfigRepository.save(config);
      } else {
        config = this.applicationConfigRepository.create({
          postId: id,
          ...merged,
        });
        await this.applicationConfigRepository.save(config);
      }
    }

    const updated = await this.announcementRepository.findOne({
      where: { postId: id },
      relations: ['category'],
    });
    return toListItem(updated!);
  }

  /**
   * 모집공고 삭제. 작성자만 삭제 가능.
   * application_config, announcement_major(조인테이블) 함께 삭제.
   */
  async remove(userId: string, id: string): Promise<void> {
    const announcement = await this.announcementRepository.findOne({
      where: { postId: id },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.userId !== userId) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    await this.applicationConfigRepository.delete({ postId: id });
    await this.announcementRepository.manager.query(
      'DELETE FROM announcement_major WHERE post_id = ?',
      [id],
    );
    await this.announcementRepository.delete({ postId: id });
  }
}
