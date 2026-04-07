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
import type {
  ApplicationAwardSnapshot,
  ApplicationCareerSnapshot,
  ApplicationCertificateSnapshot,
  ApplicationEducationSnapshot,
  ApplicationFileSnapshot,
} from '../types/application-snapshot.types';

/** 지원서 응답 성별 (지원폼 테이블) */
export enum ApplicationGender {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
  NONE = 'NONE',
}

/** 모집자 심사 상태 */
export enum ApplicationStatus {
  /** 제출 직후 (기본) */
  SUBMITTED = 'SUBMITTED',
  /** 서류 검토 중 */
  DOCUMENT_REVIEW = 'DOCUMENT_REVIEW',
  /** 합격 */
  ACCEPTED = 'ACCEPTED',
  /** 불합격 */
  REJECTED = 'REJECTED',
}

/**
 * 지원폼 (application) — 제출 시점 스냅샷
 * 학력·경력 등은 types/application-snapshot.types.ts 형식의 JSON 배열
 */
@Entity('application')
@Unique('UQ_application_post_applicant', ['postId', 'userId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  name: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  birth: Date | null;

  @Column({
    type: 'enum',
    enum: ApplicationGender,
    nullable: true,
  })
  gender: ApplicationGender | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  major: string | null;

  @Column({
    name: 'major_detail',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  majorDetail: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  music: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  link: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  introduce: string | null;

  /** 사진/영상/파일 첨부 스냅샷 (`ApplicationFileSnapshot`) */
  @Column({ type: 'json', nullable: true })
  file: ApplicationFileSnapshot;

  /** 학력 스냅샷 (`ApplicationEducationSnapshot`) */
  @Column({ type: 'json', nullable: true })
  education: ApplicationEducationSnapshot;

  /** 경력 스냅샷 (`ApplicationCareerSnapshot`) */
  @Column({ type: 'json', nullable: true })
  career: ApplicationCareerSnapshot;

  /** 수상 스냅샷 (`ApplicationAwardSnapshot`) */
  @Column({ type: 'json', nullable: true })
  award: ApplicationAwardSnapshot;

  /** 수료증·자격증 스냅샷 (`ApplicationCertificateSnapshot`) */
  @Column({ type: 'json', nullable: true })
  certificate: ApplicationCertificateSnapshot;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    default: ApplicationStatus.SUBMITTED,
  })
  status: ApplicationStatus;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;

  @Column({ name: 'canceled_at', type: 'datetime', nullable: true })
  canceledAt: Date | null;

  @Column({ name: 'post_id', type: 'char', length: 36 })
  postId: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @ManyToOne(() => Announcement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id', referencedColumnName: 'postId' })
  announcement: Announcement;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: User;
}
