import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application, ApplicationStatus } from '../application/entities/application.entity';
import { Announcement } from '../announcement/entities/announcement.entity';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';
import {
  REVIEW_DISAPPOINTMENT_REASON_VALUES,
  REVIEW_POSITIVE_REASON_VALUES,
} from './review.constants';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { Review, ReviewRating } from './entities/review.entity';

function isScheduledPast(scheduledAt: Date): boolean {
  return new Date(scheduledAt).getTime() < Date.now();
}

function isAnnouncementCompleted(a: Announcement): boolean {
  return Boolean(a.completedManually) || isScheduledPast(a.scheduledAt);
}

function encodeReviewCursor(createdAt: Date, reviewId: string): string {
  return encodeCursor({ t: createdAt.toISOString(), i: reviewId });
}

function decodeReviewCursor(cursor: string): { t: string; i: string } {
  try {
    const parsed = decodeCursor(cursor) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') {
      throw new Error('invalid cursor shape');
    }
    if (Number.isNaN(new Date(parsed.t).getTime())) {
      throw new Error('invalid cursor datetime');
    }
    return { t: parsed.t, i: parsed.i };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly noticeService: NoticeService,
  ) {}

  async create(
    reviewerUserId: string,
    postId: string,
    dto: CreateReviewDto,
  ): Promise<Review> {
    const announcement = await this.announcementRepo.findOne({
      where: { postId },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (!isAnnouncementCompleted(announcement)) {
      throw new BadRequestException(
        '공연이 완료된 공고에만 활동 후기를 작성할 수 있습니다.',
      );
    }

    if (dto.revieweeUserId === reviewerUserId) {
      throw new BadRequestException('본인에게는 후기를 남길 수 없습니다.');
    }

    const payload = {
      rating: dto.rating,
      disappointmentReasonCodes: dto.disappointmentReasonCodes,
      privateNoteToOps: dto.privateNoteToOps,
      positiveReasonCodes: dto.positiveReasonCodes,
      publicNote: dto.publicNote,
    };
    this.assertRatingSideFields(payload);

    const reasons = this.normalizeDisappointmentReasonCodes(
      dto.rating,
      dto.disappointmentReasonCodes,
    );
    const positiveReasons = this.normalizePositiveReasonCodes(
      dto.rating,
      dto.positiveReasonCodes,
    );

    const { role, counterpartOk } = await this.validateParticipants(
      announcement,
      reviewerUserId,
      dto.revieweeUserId,
    );
    if (!counterpartOk) {
      throw new BadRequestException(
        '해당 공고에서 상대방으로 지정할 수 없는 사용자입니다.',
      );
    }
    if (role === 'none') {
      throw new ForbiddenException(
        '이 공고의 모집자 또는 합격한 지원자만 후기를 작성할 수 있습니다.',
      );
    }

    const dup = await this.reviewRepo.findOne({
      where: { postId, reviewerUserId },
    });
    if (dup) {
      throw new ConflictException('이미 이 공고에 활동 후기를 제출했습니다.');
    }

    const row = this.reviewRepo.create({
      postId,
      reviewerUserId,
      revieweeUserId: dto.revieweeUserId,
      rating: dto.rating,
      disappointmentReasonCodes: reasons,
      positiveReasonCodes: positiveReasons,
      publicNote:
        dto.rating !== ReviewRating.DISAPPOINTING && dto.publicNote?.trim()
          ? dto.publicNote.trim()
          : null,
      privateNoteToOps:
        dto.rating === ReviewRating.DISAPPOINTING && dto.privateNoteToOps?.trim()
          ? dto.privateNoteToOps.trim()
          : null,
    });
    const saved = await this.reviewRepo.save(row);

    await this.notifyReviewee(
      reviewerUserId,
      announcement,
      saved.id,
      saved.revieweeUserId,
    );

    return saved;
  }

  async findMineForPost(
    reviewerUserId: string,
    postId: string,
  ): Promise<Review | null> {
    return this.reviewRepo.findOne({
      where: { postId, reviewerUserId },
    });
  }

  async listWrittenByUser(userId: string, query: ListReviewsQueryDto) {
    return this.listByRole('writer', userId, query);
  }

  async listReceivedByUser(userId: string, query: ListReviewsQueryDto) {
    return this.listByRole('receiver', userId, query);
  }

  async hideFromProfile(
    revieweeUserId: string,
    reviewId: string,
  ): Promise<{ hidden: boolean }> {
    const row = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!row) {
      throw new NotFoundException('후기를 찾을 수 없습니다.');
    }
    if (row.revieweeUserId !== revieweeUserId) {
      throw new ForbiddenException('본인이 받은 후기만 숨길 수 있습니다.');
    }
    if (row.hiddenFromProfileAt) {
      return { hidden: true };
    }
    row.hiddenFromProfileAt = new Date();
    await this.reviewRepo.save(row);
    return { hidden: true };
  }

  async unhideFromProfile(
    revieweeUserId: string,
    reviewId: string,
  ): Promise<{ hidden: boolean }> {
    const row = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!row) {
      throw new NotFoundException('후기를 찾을 수 없습니다.');
    }
    if (row.revieweeUserId !== revieweeUserId) {
      throw new ForbiddenException('본인이 받은 후기만 다시 표시할 수 있습니다.');
    }
    if (!row.hiddenFromProfileAt) {
      return { hidden: false };
    }
    row.hiddenFromProfileAt = null;
    await this.reviewRepo.save(row);
    return { hidden: false };
  }

  async update(
    reviewerUserId: string,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<Review> {
    const row = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });
    if (!row) {
      throw new NotFoundException('후기를 찾을 수 없습니다.');
    }
    if (row.reviewerUserId !== reviewerUserId) {
      throw new ForbiddenException('본인이 작성한 후기만 수정할 수 있습니다.');
    }

    const nextRating = dto.rating ?? row.rating;
    const nextReasons =
      dto.disappointmentReasonCodes ?? row.disappointmentReasonCodes ?? undefined;
    const nextPositiveReasons =
      dto.positiveReasonCodes ?? row.positiveReasonCodes ?? undefined;
    const nextOpsNote =
      dto.privateNoteToOps !== undefined ? dto.privateNoteToOps : row.privateNoteToOps;
    const nextPublicNote =
      dto.publicNote !== undefined ? dto.publicNote : row.publicNote;

    this.assertRatingSideFields({
      rating: nextRating,
      disappointmentReasonCodes: nextReasons,
      privateNoteToOps: nextOpsNote,
      positiveReasonCodes: nextPositiveReasons,
      publicNote: nextPublicNote,
    });

    row.rating = nextRating;
    row.disappointmentReasonCodes = this.normalizeDisappointmentReasonCodes(
      nextRating,
      nextReasons ?? undefined,
    );
    row.positiveReasonCodes = this.normalizePositiveReasonCodes(
      nextRating,
      nextPositiveReasons ?? undefined,
    );
    row.privateNoteToOps =
      nextRating === ReviewRating.DISAPPOINTING && nextOpsNote?.trim()
        ? nextOpsNote.trim()
        : null;
    row.publicNote =
      nextRating !== ReviewRating.DISAPPOINTING && nextPublicNote?.trim()
        ? nextPublicNote.trim()
        : null;

    return this.reviewRepo.save(row);
  }

  async remove(reviewerUserId: string, reviewId: string): Promise<{ deleted: boolean }> {
    const row = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!row) {
      throw new NotFoundException('후기를 찾을 수 없습니다.');
    }
    if (row.reviewerUserId !== reviewerUserId) {
      throw new ForbiddenException('본인이 작성한 후기만 삭제할 수 있습니다.');
    }
    await this.reviewRepo.delete({ id: reviewId });
    return { deleted: true };
  }

  private async listByRole(
    role: 'writer' | 'receiver',
    userId: string,
    query: ListReviewsQueryDto,
  ) {
    const limit = query.limit ?? 20;
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.announcement', 'a')
      .leftJoinAndSelect('r.reviewer', 'reviewer')
      .leftJoinAndSelect('r.reviewee', 'reviewee')
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .take(limit + 1);

    if (role === 'writer') {
      qb.where('r.reviewer_user_id = :userId', { userId });
    } else {
      qb.where('r.reviewee_user_id = :userId', { userId });
      if (query.hiddenOnly) {
        qb.andWhere('r.hidden_from_profile_at IS NOT NULL');
      } else {
        qb.andWhere('r.hidden_from_profile_at IS NULL');
      }
    }

    if (query.cursor) {
      const { t, i } = decodeReviewCursor(query.cursor);
      const ca = new Date(t);
      qb.andWhere('(r.created_at < :ca OR (r.created_at = :ca AND r.id < :rid))', {
        ca,
        rid: i,
      });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last ? encodeReviewCursor(last.createdAt, last.id) : null;

    return {
      items: slice.map((r) => ({
        id: r.id,
        postId: r.postId,
        reviewerUserId: r.reviewerUserId,
        revieweeUserId: r.revieweeUserId,
        rating: r.rating,
        disappointmentReasonCodes: r.disappointmentReasonCodes,
        positiveReasonCodes: r.positiveReasonCodes,
        publicNote: r.publicNote,
        privateNoteToOps: r.privateNoteToOps,
        createdAt: r.createdAt,
        hiddenFromProfileAt: r.hiddenFromProfileAt,
        announcement: r.announcement
          ? {
              postId: r.announcement.postId,
              title: r.announcement.title,
              scheduledAt: r.announcement.scheduledAt,
            }
          : null,
        reviewer: r.reviewer
          ? {
              userId: r.reviewer.userId,
              name: r.reviewer.name,
              activityName: r.reviewer.activityName,
              profileImgUrl: r.reviewer.profileImgUrl,
            }
          : null,
        reviewee: r.reviewee
          ? {
              userId: r.reviewee.userId,
              name: r.reviewee.name,
              activityName: r.reviewee.activityName,
              profileImgUrl: r.reviewee.profileImgUrl,
            }
          : null,
      })),
      nextCursor,
      hasMore,
    };
  }

  private assertRatingSideFields(dto: {
    rating: ReviewRating;
    disappointmentReasonCodes?: string[] | null;
    privateNoteToOps?: string | null;
    positiveReasonCodes?: string[] | null;
    publicNote?: string | null;
  }): void {
    if (dto.rating !== ReviewRating.DISAPPOINTING) {
      if (dto.disappointmentReasonCodes?.length) {
        throw new BadRequestException(
          '아쉬움 평가일 때만 사유를 선택할 수 있습니다.',
        );
      }
      if (dto.privateNoteToOps?.trim()) {
        throw new BadRequestException(
          '운영팀 메모는 아쉬움 평가일 때만 입력할 수 있습니다.',
        );
      }
      return;
    }
    if (dto.positiveReasonCodes?.length) {
      throw new BadRequestException(
        '좋았어요/감동했어요 평가일 때만 긍정 항목을 선택할 수 있습니다.',
      );
    }
    if (dto.publicNote?.trim()) {
      throw new BadRequestException(
        '공개 후기 본문은 좋았어요/감동했어요 평가일 때만 입력할 수 있습니다.',
      );
    }
  }

  private normalizeDisappointmentReasonCodes(
    rating: ReviewRating,
    raw: string[] | null | undefined,
  ): string[] | null {
    if (rating !== ReviewRating.DISAPPOINTING) {
      return null;
    }
    if (!raw?.length) {
      return [];
    }
    const allowed = new Set(REVIEW_DISAPPOINTMENT_REASON_VALUES);
    for (const c of raw) {
      if (!allowed.has(c)) {
        throw new BadRequestException(`알 수 없는 사유 코드입니다: ${c}`);
      }
    }
    return [...new Set(raw)];
  }

  private normalizePositiveReasonCodes(
    rating: ReviewRating,
    raw: string[] | null | undefined,
  ): string[] | null {
    if (rating === ReviewRating.DISAPPOINTING) {
      return null;
    }
    if (!raw?.length) {
      return [];
    }
    const allowed = new Set(REVIEW_POSITIVE_REASON_VALUES);
    for (const c of raw) {
      if (!allowed.has(c)) {
        throw new BadRequestException(`알 수 없는 긍정 사유 코드입니다: ${c}`);
      }
    }
    return [...new Set(raw)];
  }

  /**
   * 모집자 ↔ 합격 지원자 쌍만 허용. reviewee가 그 상대인지 검증.
   */
  private async validateParticipants(
    announcement: Announcement,
    reviewerUserId: string,
    revieweeUserId: string,
  ): Promise<{ role: 'owner' | 'accepted' | 'none'; counterpartOk: boolean }> {
    const ownerId = announcement.userId;

    if (reviewerUserId === ownerId) {
      const accepted = await this.applicationRepo.findOne({
        where: {
          postId: announcement.postId,
          userId: revieweeUserId,
          status: ApplicationStatus.ACCEPTED,
        },
      });
      return {
        role: 'owner',
        counterpartOk: Boolean(accepted),
      };
    }

    const mine = await this.applicationRepo.findOne({
      where: {
        postId: announcement.postId,
        userId: reviewerUserId,
        status: ApplicationStatus.ACCEPTED,
      },
    });
    if (mine) {
      return {
        role: 'accepted',
        counterpartOk: revieweeUserId === ownerId,
      };
    }

    return { role: 'none', counterpartOk: false };
  }

  private async notifyReviewee(
    actorUserId: string,
    announcement: Announcement,
    reviewId: string,
    revieweeUserId: string,
  ): Promise<void> {
    const applicant = await this.userRepo.findOne({
      where: { userId: actorUserId },
      select: ['name', 'activityName'],
    });
    const name = applicant?.activityName ?? applicant?.name ?? '회원';
    const titleCut =
      announcement.title.length > 80
        ? `${announcement.title.slice(0, 80)}…`
        : announcement.title;
    const content = `${name}님이 "${titleCut}" 활동 후기를 남겼습니다.`.slice(
      0,
      500,
    );
    await this.noticeService.createAndDispatchPush({
      actorUserId,
      targetType: NoticeTargetType.REVIEW,
      targetId: reviewId,
      content,
      recipientUserIds: [revieweeUserId],
    });
  }
}
