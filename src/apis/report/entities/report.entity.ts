import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** 신고 대상 종류 */
export enum ReportTargetType {
  COMMUNITY = 'COMMUNITY',
  NEWS = 'NEWS',
  COMMENT = 'COMMENT',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  CHAT = 'CHAT',
  REVIEW = 'REVIEW',
}

/**
 * 신고 사유 (API 값 — 한글 라벨은 README 참고)
 * - HATE_OR_SLUR: 혐오/욕설 표현
 * - SPAM: 스팸/도배
 * - HARMFUL_TO_YOUTH: 청소년 유해
 * - ILLEGAL: 불법정보 포함
 * - OBSCENE: 음란물
 * - OFFENSIVE: 불쾌한 표현
 */
export enum ReportCategory {
  HATE_OR_SLUR = 'HATE_OR_SLUR',
  SPAM = 'SPAM',
  HARMFUL_TO_YOUTH = 'HARMFUL_TO_YOUTH',
  ILLEGAL = 'ILLEGAL',
  OBSCENE = 'OBSCENE',
  OFFENSIVE = 'OFFENSIVE',
}

@Entity('report')
@Unique('UQ_report_reporter_reported', ['reporterId', 'reportedUserId'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  reportId: string;

  @Column({ name: 'reporter_id', type: 'char', length: 36 })
  reporterId: string;

  @Column({ name: 'reported_user_id', type: 'char', length: 36 })
  reportedUserId: string;

  @Column({ type: 'enum', enum: ReportCategory })
  category: ReportCategory;

  @Column({ name: 'target_type', type: 'enum', enum: ReportTargetType })
  targetType: ReportTargetType;

  @Column({ name: 'target_id', type: 'char', length: 36 })
  targetId: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
