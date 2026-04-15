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
import { REVIEW_DISAPPOINTMENT_REASON_VALUES } from './review.constants';
import { CreateReviewDto } from './dto/create-review.dto';
import { Review, ReviewRating } from './entities/review.entity';

function isScheduledPast(scheduledAt: Date): boolean {
  return new Date(scheduledAt).getTime() < Date.now();
}

function isAnnouncementCompleted(a: Announcement): boolean {
  return Boolean(a.completedManually) || isScheduledPast(a.scheduledAt);
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

    this.assertRatingSideFields(dto);

    const reasons = this.normalizeDisappointmentReasonCodes(
      dto.rating,
      dto.disappointmentReasonCodes,
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
      privateNoteToOps:
        dto.rating === ReviewRating.DISAPPOINTING &&
        dto.privateNoteToOps?.trim()
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

  private assertRatingSideFields(dto: CreateReviewDto): void {
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
    }
  }

  private normalizeDisappointmentReasonCodes(
    rating: ReviewRating,
    raw: string[] | undefined,
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
      select: ['nickname', 'activityName'],
    });
    const name = applicant?.activityName ?? applicant?.nickname ?? '회원';
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
