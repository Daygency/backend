import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LikeType } from '../../like/entities/like.entity';
import { User } from '../../user/entities/user.entity';
import { NoticeRecipient } from './notice-recipient.entity';

export enum NoticeTargetType {
  COMMENT = 'COMMENT',
  FOLLOW = 'FOLLOW',
  APPLICATION = 'APPLICATION',
  LIKE = 'LIKE',
  /** 공연 완료 후 상대방이 남긴 활동 후기 */
  REVIEW = 'REVIEW',
  /** 고객센터 1:1 문의 답변 — `target_id` = inquiry id */
  INQUIRY = 'INQUIRY',
  /** 관리자 전체 공지 발송 — `target_id` = 발송한 관리자 user id */
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

@Entity('notice')
export class Notice {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  actorUser: User;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: NoticeTargetType,
  })
  targetType: NoticeTargetType;

  @Column({ name: 'target_id', type: 'char', length: 36 })
  targetId: string;

  /** `target_type === LIKE` 일 때만: 좋아요 대상 종류 (뉴스/커뮤니티/공고/댓글) */
  @Column({
    name: 'like_kind',
    type: 'enum',
    enum: LikeType,
    nullable: true,
  })
  likeKind: LikeType | null;

  /** 인박스·푸시에 동일하게 사용하는 문구 (ERD 20자는 푸시에 부족해 500으로 확장) */
  @Column({ name: 'content', type: 'varchar', length: 500, nullable: true })
  content: string | null;

  /** 관리자 공지처럼 커스텀 제목이 필요한 경우만 사용. 없으면 targetType 기본 제목 사용 */
  @Column({ name: 'title', type: 'varchar', length: 100, nullable: true })
  title: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
  })
  updatedAt: Date;

  @OneToMany(() => NoticeRecipient, (r) => r.notice)
  recipients: NoticeRecipient[];
}
