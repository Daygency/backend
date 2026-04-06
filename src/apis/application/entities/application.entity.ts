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

/** 지원서 응답 성별 (지원폼 테이블) */
export enum ApplicationGender {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
  NONE = 'NONE',
}

/** DB JSON 컬럼에 저장되는 스냅샷 (객체·배열·원시 JSON 루트) */
export type ApplicationJsonSnapshot =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

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
 * 학력·경력·첨부 등은 JSON으로 저장 (프로필에서 채운 뒤 수정·삭제 가능)
 */
@Entity('application')
@Unique('UQ_application_post_applicant', ['postId', 'userId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  birth: string | null;

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  music: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  link: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  introduce: string | null;

  /** 사진/영상/파일 등 첨부 메타·URL 목록 스냅샷 */
  @Column({ type: 'json', nullable: true })
  file: ApplicationJsonSnapshot;

  /** 학력(학교/학년 등) 스냅샷 */
  @Column({ type: 'json', nullable: true })
  education: ApplicationJsonSnapshot;

  /** 경력 스냅샷 */
  @Column({ type: 'json', nullable: true })
  career: ApplicationJsonSnapshot;

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
