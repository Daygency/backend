import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Announcement } from '../../announcement/entities/announcement.entity';
import { User } from '../../user/entities/user.entity';

/** 첫 화면 만족도 (아쉬웠어요 / 좋았어요 / 감동했어요) */
export enum ReviewRating {
  DISAPPOINTING = 'DISAPPOINTING',
  GOOD = 'GOOD',
  IMPRESSED = 'IMPRESSED',
}

@Entity('review')
@Unique('UQ_review_post_reviewer', ['postId', 'reviewerUserId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'char', length: 36 })
  postId: string;

  @ManyToOne(() => Announcement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id', referencedColumnName: 'postId' })
  announcement: Announcement;

  @Column({ name: 'reviewer_user_id', type: 'char', length: 36 })
  reviewerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_user_id', referencedColumnName: 'userId' })
  reviewer: User;

  @Column({ name: 'reviewee_user_id', type: 'char', length: 36 })
  revieweeUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewee_user_id', referencedColumnName: 'userId' })
  reviewee: User;

  @Column({
    type: 'enum',
    enum: ReviewRating,
  })
  rating: ReviewRating;

  /**
   * `DISAPPOINTING`일 때 선택한 사유 코드 배열.
   * `ReviewDisappointmentReason` 값만 허용.
   */
  @Column({ name: 'disappointment_reason_codes', type: 'json', nullable: true })
  disappointmentReasonCodes: string[] | null;

  /**
   * `GOOD`/`IMPRESSED`일 때 선택한 긍정 사유 코드 배열.
   */
  @Column({ name: 'positive_reason_codes', type: 'json', nullable: true })
  positiveReasonCodes: string[] | null;

  /**
   * 상대방에게 공개되는 후기 코멘트. 평점 상관없이 선택 입력.
   */
  @Column({ name: 'comment', type: 'text', nullable: true })
  comment: string | null;

  /** 수신자가 프로필에서 숨긴 시각 (null이면 노출) */
  @Column({
    name: 'hidden_from_profile_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  hiddenFromProfileAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;
}
