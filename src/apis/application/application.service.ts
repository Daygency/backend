import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Announcement,
  AnnouncementStatus,
} from '../announcement/entities/announcement.entity';
import { ApplicationConfig } from '../announcement/entities/application-config.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { Application, ApplicationStatus } from './entities/application.entity';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { ChatService } from '../chat/chat.service';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';
import type {
  ApplicationAwardSnapshot,
  ApplicationCareerSnapshot,
  ApplicationCertificateSnapshot,
  ApplicationEducationSnapshot,
  ApplicationFileSnapshot,
} from './types/application-snapshot.types';
import { toApplicationDetailResponse } from './utils/application-response.util';
import type { ApplicationDetailResponse } from './utils/application-response.util';

/** JSON 배열 컬럼에 1개 이상 항목이 있는지 */
function hasJsonArrayContent(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function decodeApplicationCursor(cursor: string): { t: string; i: string } {
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

function encodeApplicationCursor(createdAt: Date, id: string): string {
  return encodeCursor({ t: createdAt.toISOString(), i: id });
}

@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name);

  constructor(
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(ApplicationConfig)
    private readonly applicationConfigRepo: Repository<ApplicationConfig>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly chatService: ChatService,
    private readonly noticeService: NoticeService,
  ) {}

  async submit(
    applicantUserId: string,
    dto: CreateApplicationDto,
  ): Promise<Application> {
    const postId = dto.postId;
    const announcement = await this.announcementRepo.findOne({
      where: { postId },
      relations: { applicationConfig: true },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.userId === applicantUserId) {
      throw new BadRequestException('본인이 올린 공고에는 지원할 수 없습니다.');
    }
    if (announcement.status !== AnnouncementStatus.OPEN) {
      throw new BadRequestException('모집이 마감된 공고입니다.');
    }
    const deadlinePassed =
      announcement.deadlineAt != null &&
      new Date(announcement.deadlineAt).getTime() < Date.now();
    if (deadlinePassed) {
      throw new BadRequestException('지원 마감일이 지났습니다.');
    }

    const config =
      announcement.applicationConfig ??
      (await this.applicationConfigRepo.findOne({
        where: { postId },
      }));
    if (!config) {
      throw new BadRequestException('지원서 양식이 설정되지 않은 공고입니다.');
    }

    const existing = await this.applicationRepo.findOne({
      where: { postId, userId: applicantUserId },
      withDeleted: true,
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('이미 이 공고에 지원했습니다.');
    }

    this.validateAgainstConfig(config, dto);

    const isRestore = Boolean(existing?.deletedAt);

    if (isRestore && existing) {
      this.patchApplicationFromSubmitDto(existing, dto, applicantUserId);
      const saved = await this.applicationRepo.save(existing);
      try {
        await this.chatService.ensureAnnouncementRoomAfterApply(
          applicantUserId,
          postId,
          saved.id,
        );
      } catch (err) {
        await this.applicationRepo.softDelete({ id: saved.id });
        throw err;
      }
      return saved;
    }

    const entity = this.applicationRepo.create({
      postId,
      userId: applicantUserId,
    });
    this.patchApplicationFromSubmitDto(entity, dto, applicantUserId);

    const saved = await this.applicationRepo.save(entity);
    try {
      await this.chatService.ensureAnnouncementRoomAfterApply(
        applicantUserId,
        postId,
        saved.id,
      );
    } catch (err) {
      await this.applicationRepo.delete({ id: saved.id });
      throw err;
    }
    void this.notifyAnnouncementApplication(applicantUserId, announcement);
    return saved;
  }

  /** 제출/재제출(복구) 시 본문 필드 일괄 반영 */
  private patchApplicationFromSubmitDto(
    target: Application,
    dto: CreateApplicationDto,
    applicantUserId: string,
  ): void {
    target.postId = dto.postId;
    target.userId = applicantUserId;
    target.status = ApplicationStatus.SUBMITTED;
    target.canceledAt = null;
    target.deletedAt = null;
    target.name = dto.name?.trim() ?? null;
    target.birth =
      dto.birth === undefined || dto.birth === null || dto.birth === ''
        ? null
        : new Date(dto.birth);
    target.gender = dto.gender ?? null;
    target.major = dto.major?.trim() ?? null;
    target.majorDetail = dto.majorDetail?.trim() ?? null;
    target.category = dto.category?.trim() ?? null;
    target.music = dto.music?.trim() ?? null;
    target.address = dto.address?.trim() ?? null;
    target.file =
      dto.file === undefined ? null : (dto.file as ApplicationFileSnapshot);
    target.link = dto.link?.trim() ?? null;
    target.department = dto.department?.trim() ?? null;
    target.introduce = dto.introduce?.trim() ?? null;
    target.education =
      dto.education === undefined
        ? null
        : (dto.education as ApplicationEducationSnapshot);
    target.career =
      dto.career === undefined
        ? null
        : (dto.career as ApplicationCareerSnapshot);
    target.award =
      dto.award === undefined ? null : (dto.award as ApplicationAwardSnapshot);
    target.certificate =
      dto.certificate === undefined
        ? null
        : (dto.certificate as ApplicationCertificateSnapshot);
  }

  private async notifyAnnouncementApplication(
    applicantUserId: string,
    announcement: Announcement,
  ): Promise<void> {
    try {
      const applicant = await this.userRepo.findOne({
        where: { userId: applicantUserId },
        select: ['name', 'activityName'],
      });
      const name = applicant?.activityName ?? applicant?.name ?? '회원';
      const titleCut =
        announcement.title.length > 80
          ? `${announcement.title.slice(0, 80)}…`
          : announcement.title;
      const content = `${name}님이 "${titleCut}" 공고에 지원했습니다.`.slice(
        0,
        500,
      );
      await this.noticeService.createAndDispatchPush({
        actorUserId: applicantUserId,
        targetType: NoticeTargetType.APPLICATION,
        targetId: announcement.postId,
        content,
        recipientUserIds: [announcement.userId],
      });
    } catch (e) {
      this.logger.error('notifyAnnouncementApplication failed', e);
    }
  }

  async findOneById(
    applicationId: string,
    requestUserId: string,
  ): Promise<ApplicationDetailResponse> {
    const app = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: { announcement: true, user: true },
    });
    if (!app) {
      throw new NotFoundException('지원서를 찾을 수 없습니다.');
    }
    const isApplicant = app.userId === requestUserId;
    const isAuthor = app.announcement.userId === requestUserId;
    if (!isApplicant && !isAuthor) {
      throw new ForbiddenException('이 지원서를 조회할 권한이 없습니다.');
    }
    return toApplicationDetailResponse(app);
  }

  async update(
    applicantUserId: string,
    applicationId: string,
    dto: UpdateApplicationDto,
  ): Promise<Application> {
    const existing = await this.applicationRepo.findOne({
      where: { id: applicationId },
    });
    if (!existing) {
      throw new NotFoundException('지원서를 찾을 수 없습니다.');
    }
    if (existing.userId !== applicantUserId) {
      throw new ForbiddenException('본인의 지원서만 수정할 수 있습니다.');
    }

    const announcement = await this.announcementRepo.findOne({
      where: { postId: existing.postId },
      relations: { applicationConfig: true },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.status !== AnnouncementStatus.OPEN) {
      throw new BadRequestException('모집이 마감된 공고입니다.');
    }
    const deadlinePassed =
      announcement.deadlineAt != null &&
      new Date(announcement.deadlineAt).getTime() < Date.now();
    if (deadlinePassed) {
      throw new BadRequestException('지원 마감일이 지났습니다.');
    }

    const config =
      announcement.applicationConfig ??
      (await this.applicationConfigRepo.findOne({
        where: { postId: existing.postId },
      }));
    if (!config) {
      throw new BadRequestException('지원서 양식이 설정되지 않은 공고입니다.');
    }

    const merged = this.mergeForValidation(existing, dto);
    this.validateAgainstConfig(config, merged);

    if (dto.name !== undefined) {
      existing.name = dto.name?.trim() ?? null;
    }
    if (dto.birth !== undefined) {
      existing.birth =
        dto.birth === null || dto.birth === ''
          ? null
          : new Date(dto.birth);
    }
    if (dto.gender !== undefined) {
      existing.gender = dto.gender ?? null;
    }
    if (dto.major !== undefined) {
      existing.major = dto.major?.trim() ?? null;
    }
    if (dto.majorDetail !== undefined) {
      existing.majorDetail = dto.majorDetail?.trim() ?? null;
    }
    if (dto.category !== undefined) {
      existing.category = dto.category?.trim() ?? null;
    }
    if (dto.music !== undefined) {
      existing.music = dto.music?.trim() ?? null;
    }
    if (dto.address !== undefined) {
      existing.address = dto.address?.trim() ?? null;
    }
    if (dto.file !== undefined) {
      existing.file = dto.file as ApplicationFileSnapshot;
    }
    if (dto.link !== undefined) {
      existing.link = dto.link?.trim() ?? null;
    }
    if (dto.department !== undefined) {
      existing.department = dto.department?.trim() ?? null;
    }
    if (dto.introduce !== undefined) {
      existing.introduce = dto.introduce?.trim() ?? null;
    }
    if (dto.education !== undefined) {
      existing.education = dto.education as ApplicationEducationSnapshot;
    }
    if (dto.career !== undefined) {
      existing.career = dto.career as ApplicationCareerSnapshot;
    }
    if (dto.award !== undefined) {
      existing.award = dto.award as ApplicationAwardSnapshot;
    }
    if (dto.certificate !== undefined) {
      existing.certificate = dto.certificate as ApplicationCertificateSnapshot;
    }

    return this.applicationRepo.save(existing);
  }

  /**
   * 해당 공고 작성자(모집자)만 지원서 심사 상태를 변경할 수 있습니다.
   */
  async updateStatusByRecruiter(
    recruiterUserId: string,
    applicationId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationDetailResponse> {
    const existing = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: { announcement: true },
    });
    if (!existing) {
      throw new NotFoundException('지원서를 찾을 수 없습니다.');
    }
    if (existing.announcement.userId !== recruiterUserId) {
      throw new ForbiddenException(
        '해당 공고 작성자만 지원 상태를 변경할 수 있습니다.',
      );
    }
    existing.status = dto.status;
    await this.applicationRepo.save(existing);
    return this.findOneById(applicationId, recruiterUserId);
  }

  /**
   * 지원자 본인만 소프트 삭제 (`deleted_at`). 이후 동일 공고에 다시 POST 지원 가능.
   */
  async removeByApplicant(
    applicantUserId: string,
    applicationId: string,
  ): Promise<void> {
    const app = await this.applicationRepo.findOne({
      where: { id: applicationId },
    });
    if (!app) {
      throw new NotFoundException('지원서를 찾을 수 없습니다.');
    }
    if (app.userId !== applicantUserId) {
      throw new ForbiddenException('본인의 지원서만 삭제할 수 있습니다.');
    }
    await this.applicationRepo.softDelete({ id: applicationId });
  }

  async findMine(postId: string, userId: string): Promise<Application | null> {
    return this.applicationRepo.findOne({
      where: { postId, userId },
    });
  }

  async findAllForPost(
    postId: string,
    requestUserId: string,
    query: ListApplicationsQueryDto,
  ): Promise<{
    items: ApplicationDetailResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const announcement = await this.announcementRepo.findOne({
      where: { postId },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.userId !== requestUserId) {
      throw new ForbiddenException('공고 작성자만 지원 목록을 볼 수 있습니다.');
    }

    const limit = query.limit ?? 20;
    const qb = this.applicationRepo
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.user', 'user')
      .where('application.postId = :postId', { postId })
      .orderBy('application.createdAt', 'DESC')
      .addOrderBy('application.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeApplicationCursor(query.cursor);
      qb.andWhere(
        '(application.createdAt < :ca OR (application.createdAt = :ca AND application.id < :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last ? encodeApplicationCursor(last.createdAt, last.id) : null;

    return {
      items: slice.map(toApplicationDetailResponse),
      nextCursor,
      hasMore,
    };
  }

  private mergeForValidation(
    existing: Application,
    dto: UpdateApplicationDto,
  ): CreateApplicationDto {
    return {
      postId: existing.postId,
      name: dto.name !== undefined ? dto.name : (existing.name ?? undefined),
      birth:
        dto.birth !== undefined
          ? dto.birth
          : (existing.birth != null
              ? existing.birth.toISOString()
              : undefined),
      gender:
        dto.gender !== undefined
          ? dto.gender
          : (existing.gender ?? undefined),
      major:
        dto.major !== undefined ? dto.major : (existing.major ?? undefined),
      majorDetail:
        dto.majorDetail !== undefined
          ? dto.majorDetail
          : (existing.majorDetail ?? undefined),
      category:
        dto.category !== undefined
          ? dto.category
          : (existing.category ?? undefined),
      music:
        dto.music !== undefined ? dto.music : (existing.music ?? undefined),
      address:
        dto.address !== undefined
          ? dto.address
          : (existing.address ?? undefined),
      file: dto.file !== undefined ? dto.file : (existing.file ?? undefined),
      link: dto.link !== undefined ? dto.link : (existing.link ?? undefined),
      department:
        dto.department !== undefined
          ? dto.department
          : (existing.department ?? undefined),
      introduce:
        dto.introduce !== undefined
          ? dto.introduce
          : (existing.introduce ?? undefined),
      education:
        dto.education !== undefined
          ? dto.education
          : (existing.education ?? undefined),
      career:
        dto.career !== undefined
          ? dto.career
          : (existing.career ?? undefined),
      award:
        dto.award !== undefined ? dto.award : (existing.award ?? undefined),
      certificate:
        dto.certificate !== undefined
          ? dto.certificate
          : (existing.certificate ?? undefined),
    };
  }

  private validateAgainstConfig(
    config: ApplicationConfig,
    dto: CreateApplicationDto,
  ): void {
    const missing = (label: string, ok: boolean) => {
      if (!ok) {
        throw new BadRequestException(
          `지원서 양식에 포함된 항목입니다: ${label}을(를) 입력해 주세요.`,
        );
      }
    };

    if (config.includeName) {
      missing('이름', !!dto.name?.trim());
    }
    if (config.includeBirth) {
      missing(
        '생년월일',
        dto.birth != null && String(dto.birth).trim() !== '',
      );
    }
    if (config.includeGender) {
      missing(
        '성별',
        dto.gender !== undefined && dto.gender !== null,
      );
    }
    if (config.includeMajor) {
      missing('전공', !!dto.major?.trim());
    }
    if (config.includeMajorDetail) {
      missing('세부전공', !!dto.majorDetail?.trim());
    }
    if (config.includeEducation) {
      missing('학력', hasJsonArrayContent(dto.education));
    }
    if (config.includeCategory) {
      missing('참가부문', !!dto.category?.trim());
    }
    if (config.includeMusic) {
      missing('참가곡', !!dto.music?.trim());
    }
    if (config.includeFile) {
      missing('파일', hasJsonArrayContent(dto.file));
    }
    if (config.includeLink) {
      missing('링크', !!dto.link?.trim());
    }
    if (config.includeCareer) {
      missing('경력', hasJsonArrayContent(dto.career));
    }
    if (config.includeIntroduce) {
      missing('자기소개/지원동기', !!dto.introduce?.trim());
    }
  }
}
