import type { Express } from 'express';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { ApplicationConfigDto } from './dto/application-config.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { resolveAnnouncementPostedAt } from './announcement-created-at.util';
import {
  AnnouncementListSort,
  ListAnnouncementQueryDto,
} from './dto/list-announcement-query.dto';
import { toLikePattern } from '../../common/escape-like-pattern.util';
import {
  Announcement,
  AnnouncementPriceType,
  AnnouncementStatus,
} from './entities/announcement.entity';
import { AnnouncementCategory } from './entities/announcement-category.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { Major } from '../major/entities/major.entity';
import { File, FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { AnnouncementFileService } from './announcement-file.service';
import {
  Application,
  ApplicationStatus,
} from '../application/entities/application.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import {
  ChatRoom,
  ChatRoomKind,
} from '../chat/entities/chat-room.entity';

const MAX_ANNOUNCEMENT_IMAGES = 5;

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

/** 공연(예정)일시가 현재보다 이전이면 자동 완료로 간주 */
function isScheduledPast(scheduledAt: Date): boolean {
  return new Date(scheduledAt).getTime() < Date.now();
}

/** 수동 완료이거나 공연일이 지난 경우 */
function effectiveCompleted(a: Announcement): boolean {
  return Boolean(a.completedManually) || isScheduledPast(a.scheduledAt);
}

/** PATCH로 본문·메타를 바꾼 경우 (목록 아이템 + 전공) */
export type AnnouncementUpdateFullResponse = ReturnType<typeof toListItem> & {
  majors: Array<{ majorId: string; name: string }>;
};

/** PATCH로 조기마감만 한 경우 */
export type AnnouncementUpdateEarlyCloseResponse = {
  postId: string;
  status: AnnouncementStatus;
  isRecruiting: boolean;
};

/** PATCH로 completed만 바꾼 경우 */
export type AnnouncementUpdateCompletedOnlyResponse = {
  postId: string;
  completed: boolean;
};

export type AnnouncementUpdateResponse =
  | AnnouncementUpdateFullResponse
  | AnnouncementUpdateEarlyCloseResponse
  | AnnouncementUpdateCompletedOnlyResponse;

export interface AnnouncementListResponse {
  items: Array<{
    postId: string;
    title: string;
    address: string;
    type: string;
    isRecruiting: boolean;
    dDay: string;
    deadlineAt: Date;
    /** 공연·계약 종료 여부(수동 완료 또는 `scheduledAt` 경과) */
    completed: boolean;
    priceType: AnnouncementPriceType;
    /** 금액(원), 0 이상 */
    price: number;
    /** 누적 조회수 (목록 조회 시 DB 값, 상세 진입 시 증가분은 반영되지 않음) */
    viewCount: number;
    createdAt?: Date;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

function parseCompositeCursor(
  cursor: string,
): { primary: Date; postId: string } | null {
  const sep = cursor.lastIndexOf('|');
  if (sep <= 0) return null;
  const primary = new Date(cursor.slice(0, sep));
  const postId = cursor.slice(sep + 1).trim();
  if (Number.isNaN(primary.getTime()) || !postId) return null;
  return { primary, postId };
}

function buildCompositeCursor(primary: Date, postId: string): string {
  return `${primary.toISOString()}|${postId}`;
}

/** 공고 → 목록 아이템 형태로 변환 */
function toListItem(a: Announcement) {
  return {
    postId: a.postId,
    title: a.title,
    address: a.address,
    type: a.category?.name ?? '기타',
    isRecruiting: a.status === AnnouncementStatus.OPEN,
    dDay: calcDDay(a.deadlineAt),
    deadlineAt: a.deadlineAt,
    completed: effectiveCompleted(a),
    priceType: a.priceType,
    price: a.price,
    viewCount: Number(a.viewCount ?? 0),
    fileId: a.fileId,
  };
}

/** 지원자가 있더라도 허용되는 수정: `status`만 `CLOSED`(조기마감) */
function isEarlyCloseOnlyUpdate(dto: UpdateAnnouncementDto): boolean {
  if (dto.status !== AnnouncementStatus.CLOSED) {
    return false;
  }
  return (
    dto.completed === undefined &&
    dto.title === undefined &&
    dto.content === undefined &&
    dto.deadlineAt === undefined &&
    dto.scheduledAt === undefined &&
    dto.address === undefined &&
    dto.latitude === undefined &&
    dto.longitude === undefined &&
    dto.priceType === undefined &&
    dto.price === undefined &&
    dto.fileId === undefined &&
    dto.categoryId === undefined &&
    dto.majorIds === undefined &&
    dto.applicationConfig === undefined
  );
}

/** 지원자가 있어도 `completed`만 바꾸는 수정 허용 */
function isCompletedOnlyUpdate(dto: UpdateAnnouncementDto): boolean {
  if (dto.completed === undefined) {
    return false;
  }
  return (
    dto.status === undefined &&
    dto.title === undefined &&
    dto.content === undefined &&
    dto.deadlineAt === undefined &&
    dto.scheduledAt === undefined &&
    dto.address === undefined &&
    dto.latitude === undefined &&
    dto.longitude === undefined &&
    dto.priceType === undefined &&
    dto.price === undefined &&
    dto.fileId === undefined &&
    dto.categoryId === undefined &&
    dto.majorIds === undefined &&
    dto.applicationConfig === undefined
  );
}

@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  /**
   * 모집 전공 ID 목록을 엔티티로 조회. 빈 배열이면 연결 없음.
   * ID가 하나라도 DB에 없으면 400.
   */
  private async resolveMajorsByIds(
    majorIds: string[] | undefined,
  ): Promise<Major[]> {
    if (!majorIds?.length) {
      return [];
    }
    const unique = [...new Set(majorIds)];
    const majors = await this.majorRepository.find({
      where: { majorId: In(unique) },
    });
    if (majors.length !== unique.length) {
      throw new BadRequestException(
        '존재하지 않는 전공 ID가 포함되어 있습니다.',
      );
    }
    return majors;
  }

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
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepository: Repository<ChatRoom>,
    private readonly announcementFileService: AnnouncementFileService,
    private readonly fileService: FileService,
    private readonly noticeService: NoticeService,
  ) {}

  private async loadChatRoomCountsByPostIds(
    postIds: string[],
  ): Promise<Map<string, number>> {
    if (postIds.length === 0) {
      return new Map();
    }
    const rows = await this.chatRoomRepository
      .createQueryBuilder('room')
      .innerJoin('room.announcement', 'announcement')
      .select('announcement.postId', 'postId')
      .addSelect('COUNT(room.id)', 'count')
      .where('announcement.postId IN (:...postIds)', { postIds })
      .andWhere('room.kind = :kind', { kind: ChatRoomKind.ANNOUNCEMENT })
      .andWhere('room.deletedAt IS NULL')
      .groupBy('announcement.postId')
      .getRawMany<{ postId: string; count: string }>();
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.postId, Number(row.count) || 0);
    }
    return map;
  }

  private async notifyAcceptedPerformersCompleted(
    actorUserId: string,
    announcement: Announcement,
  ): Promise<void> {
    const accepted = await this.applicationRepository.find({
      where: {
        postId: announcement.postId,
        status: ApplicationStatus.ACCEPTED,
      },
      select: ['userId'],
    });
    const recipientUserIds = [...new Set(accepted.map((a) => a.userId))].filter(
      (id) => id !== actorUserId,
    );
    if (recipientUserIds.length === 0) {
      return;
    }
    const titleCut =
      announcement.title.length > 80
        ? `${announcement.title.slice(0, 80)}…`
        : announcement.title;
    const content =
      `"${titleCut}" 공고가 완료되어 활동 후기를 작성할 수 있어요.`.slice(
        0,
        500,
      );
    await this.noticeService.createAndDispatchPush({
      actorUserId,
      targetType: NoticeTargetType.APPLICATION,
      targetId: announcement.postId,
      content,
      recipientUserIds,
    });
  }

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
    address: string;
    type: string;
    isRecruiting: boolean;
    dDay: string;
    deadlineAt: Date;
    completed: boolean;
    priceType: AnnouncementPriceType;
    price: number;
    viewCount: number;
    /** 저장된 모집 전공 (없으면 빈 배열) */
    majors: Array<{ majorId: string; name: string }>;
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

    const majors = await this.resolveMajorsByIds(dto.majorIds);

    const announcement = this.announcementRepository.create({
      userId,
      title: dto.title,
      content: dto.content,
      deadlineAt: new Date(dto.deadlineAt),
      scheduledAt: new Date(dto.scheduledAt),
      status: dto.status ?? AnnouncementStatus.OPEN,
      address: dto.address,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      priceType: dto.priceType ?? AnnouncementPriceType.PENDING,
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
    const fileSlice = (files ?? [])
      .filter((f) => f?.buffer?.length)
      .slice(0, MAX_ANNOUNCEMENT_IMAGES);
    if (fileSlice.length) {
      uploaded = await this.announcementFileService.attachFilesToPost(
        saved.postId,
        fileSlice.map((f, i) => ({
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
      majors: majors.map((m) => ({ majorId: m.majorId, name: m.name })),
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

  private async attachCreatedAtToListItems<
    T extends { postId: string; fileId?: string | null },
  >(items: T[]): Promise<Array<T & { createdAt?: Date }>> {
    const postedAtMap =
      await this.fileService.getAnnouncementPostedAtMap(items);
    return items.map((item) => ({
      ...item,
      createdAt: resolveAnnouncementPostedAt(postedAtMap.get(item.postId)),
    }));
  }

  /**
   * 공고 목록 조회 (무한스크롤 + 필터)
   * - cursor: 마지막 postId (없으면 첫 페이지)
   * - limit: 페이지 크기 (기본 20, 최대 50)
   * - status, categoryId, majorIds, priceType: 필터 파라미터
   * - sort: created(등록순) | imminent(임박순)
   */
  async findList(
    query: ListAnnouncementQueryDto,
  ): Promise<AnnouncementListResponse> {
    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.category', 'category');

    this.applyAnnouncementListFilters(qb, query);

    const rows = await qb.getMany();
    return this.buildAnnouncementListResponse(rows, query.limit ?? 20, query.sort);
  }

  /**
   * 내가 작성한 모집공고 목록 (무한스크롤 + 필터, findList와 동일한 쿼리 파라미터)
   */
  async findMyList(
    userId: string,
    query: ListAnnouncementQueryDto,
  ): Promise<AnnouncementListResponse> {
    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.category', 'category')
      .where('announcement.userId = :userId', { userId });

    this.applyAnnouncementListFilters(qb, query);

    const rows = await qb.getMany();
    const limit = query.limit ?? 20;
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const roomCounts = await this.loadChatRoomCountsByPostIds(
      slice.map((row) => row.postId),
    );
    const items = await this.attachCreatedAtToListItems(
      slice.map((row) => ({
        ...toListItem(row),
        chatRoomCount: roomCounts.get(row.postId) ?? 0,
      })),
    );

    const nextCursor = hasMore
      ? this.buildAnnouncementListCursor(query.sort, slice[limit - 1])
      : null;

    return { items, nextCursor, hasMore };
  }

  async findAppliedList(
    userId: string,
    query: ListAnnouncementQueryDto,
  ): Promise<AnnouncementListResponse> {
    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.category', 'category')
      .innerJoin(
        Application,
        'app',
        'app.postId = announcement.postId AND app.userId = :userId',
        { userId },
      )
      .andWhere('app.deletedAt IS NULL');

    this.applyAnnouncementListFilters(qb, query);

    const rows = await qb.getMany();
    return this.buildAnnouncementListResponse(
      rows,
      query.limit ?? 20,
      query.sort,
    );
  }

  private applyAnnouncementListFilters(
    qb: ReturnType<Repository<Announcement>['createQueryBuilder']>,
    query: ListAnnouncementQueryDto,
  ): void {
    const {
      cursor,
      limit = 20,
      status,
      categoryId,
      majorIds: majorIdsStr,
      priceType,
      q,
      sort = 'created',
    } = query;
    const likeQ = q ? toLikePattern(q) : null;
    const now = new Date();

    qb.take(limit + 1);

    if (sort === 'imminent') {
      qb.andWhere('announcement.deadlineAt >= :now', { now });
      qb.orderBy('announcement.deadlineAt', 'ASC').addOrderBy(
        'announcement.postId',
        'ASC',
      );

      if (cursor) {
        const parsed = parseCompositeCursor(cursor);
        if (parsed) {
          qb.andWhere(
            `(announcement.deadlineAt > :cursorPrimary)
             OR (announcement.deadlineAt = :cursorPrimary AND announcement.postId > :cursorPostId)`,
            {
              cursorPrimary: parsed.primary,
              cursorPostId: parsed.postId,
            },
          );
        }
      }
    } else {
      qb.orderBy('announcement.createdAt', 'DESC').addOrderBy(
        'announcement.postId',
        'DESC',
      );

      if (cursor) {
        const parsed = parseCompositeCursor(cursor);
        if (parsed) {
          qb.andWhere(
            `(announcement.createdAt < :cursorPrimary)
             OR (announcement.createdAt = :cursorPrimary AND announcement.postId < :cursorPostId)`,
            {
              cursorPrimary: parsed.primary,
              cursorPostId: parsed.postId,
            },
          );
        }
      }
    }

    if (status) {
      qb.andWhere('announcement.status = :status', { status });
    }
    if (categoryId) {
      qb.andWhere('category.categoryId = :categoryId', {
        categoryId: categoryId,
      });
    }
    if (priceType) {
      qb.andWhere('announcement.priceType = :priceType', { priceType });
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
    if (likeQ) {
      qb.andWhere(
        '(announcement.title LIKE :likeQ ESCAPE \'\\\\\' OR announcement.content LIKE :likeQ ESCAPE \'\\\\\' OR announcement.address LIKE :likeQ ESCAPE \'\\\\\')',
        { likeQ },
      );
    }
  }

  private async buildAnnouncementListResponse(
    rows: Announcement[],
    limit: number,
    sort: AnnouncementListSort = 'created',
  ): Promise<AnnouncementListResponse> {
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.attachCreatedAtToListItems(
      slice.map(toListItem),
    );

    const nextCursor = hasMore
      ? this.buildAnnouncementListCursor(sort, slice[limit - 1])
      : null;

    return { items, nextCursor, hasMore };
  }

  private buildAnnouncementListCursor(
    sort: AnnouncementListSort = 'created',
    row: Announcement,
  ): string {
    if (sort === 'imminent') {
      return buildCompositeCursor(row.deadlineAt, row.postId);
    }
    return buildCompositeCursor(row.createdAt, row.postId);
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

    await this.announcementRepository.increment({ postId: id }, 'viewCount', 1);
    announcement.viewCount = Number(announcement.viewCount ?? 0) + 1;

    const postedAtMap = await this.fileService.getAnnouncementPostedAtMap([
      { postId: id, fileId: announcement.fileId },
    ]);

    return {
      ...announcement,
      createdAt: resolveAnnouncementPostedAt(postedAtMap.get(id)),
      completed: effectiveCompleted(announcement),
      isMine,
    };
  }

  /**
   * 모집공고 수정. 작성자만 수정 가능.
   * 조기마감·completed만 바꾸는 요청은 최소 필드만 반환하고, 그 외는 목록 아이템+전공.
   * 지원자가 있으면 조기마감(`status: CLOSED`만) 또는 `completed`만 변경 허용.
   */
  async update(
    userId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementUpdateResponse> {
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

    if (isEarlyCloseOnlyUpdate(dto)) {
      announcement.status = AnnouncementStatus.CLOSED;
      await this.announcementRepository.save(announcement);
      return {
        postId: id,
        status: AnnouncementStatus.CLOSED,
        isRecruiting: false,
      };
    }

    if (isCompletedOnlyUpdate(dto)) {
      const wasCompleted = effectiveCompleted(announcement);
      announcement.completedManually = Boolean(dto.completed);
      await this.announcementRepository.save(announcement);
      const isCompleted = effectiveCompleted(announcement);
      if (!wasCompleted && isCompleted && dto.completed === true) {
        await this.notifyAcceptedPerformersCompleted(userId, announcement);
      }
      return {
        postId: id,
        completed: isCompleted,
      };
    }

    if (applicationCount > 0) {
      throw new ForbiddenException(
        '지원자가 있는 공고는 조기마감(상태만 마감) 또는 완료 표시(completed)만 변경할 수 있습니다.',
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
    if (dto.latitude !== undefined) announcement.latitude = dto.latitude ?? null;
    if (dto.longitude !== undefined)
      announcement.longitude = dto.longitude ?? null;
    if (dto.priceType !== undefined) announcement.priceType = dto.priceType;
    if (dto.price !== undefined) announcement.price = dto.price;
    if (dto.fileId !== undefined) announcement.fileId = dto.fileId ?? null;
    const wasCompleted = effectiveCompleted(announcement);
    if (dto.completed !== undefined) {
      announcement.completedManually = Boolean(dto.completed);
    }

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
      announcement.majors = await this.resolveMajorsByIds(dto.majorIds);
    }

    await this.announcementRepository.save(announcement);
    const isCompleted = effectiveCompleted(announcement);
    if (!wasCompleted && isCompleted && dto.completed === true) {
      await this.notifyAcceptedPerformersCompleted(userId, announcement);
    }

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
      relations: ['category', 'majors'],
    });
    const list = toListItem(updated!);
    const majorRows = updated!.majors ?? [];
    return {
      ...list,
      majors: majorRows.map((m) => ({ majorId: m.majorId, name: m.name })),
    };
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
