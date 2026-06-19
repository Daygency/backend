import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { File } from '../../file/entities/file.entity';
import { ApplicationConfig } from './application-config.entity';
import { AnnouncementCategory } from './announcement-category.entity';
import { Major } from '../../major/entities/major.entity';

export enum AnnouncementStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** 금액 구분 — `price`(원)와 함께 사용 */
export enum AnnouncementPriceType {
  /** 지출 */
  EXPENSE = 'EXPENSE',
  /** 수입 */
  INCOME = 'INCOME',
  /** 무료 */
  FREE = 'FREE',
  /** 협의 가능 */
  PENDING = 'PENDING',
}

@Entity('announcement')
export class Announcement {
  @PrimaryGeneratedColumn('uuid', { name: 'post_id' })
  postId: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'deadline_at', type: 'datetime' })
  deadlineAt: Date;

  @Column({ name: 'scheduled_at', type: 'datetime' })
  scheduledAt: Date;

  @Column({
    type: 'enum',
    enum: AnnouncementStatus,
    default: AnnouncementStatus.OPEN,
  })
  status: AnnouncementStatus;

  @Column()
  address: string;

  /** 기본값: 협의(`PENDING`) */
  @Column({
    name: 'price_type',
    type: 'enum',
    enum: AnnouncementPriceType,
    default: AnnouncementPriceType.PENDING,
  })
  priceType: AnnouncementPriceType;

  /** 금액(원). `0` 이상. 의미는 `priceType`에 따름(무료·협의 등은 보통 0). */
  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  /**
   * 작성자가 「공연·계약 종료」로 수동 표시한 값.
   * API의 `completed`는 이 값과 `scheduledAt` 경과 여부를 함께 본다.
   */
  @Column({ name: 'completed_manually', type: 'boolean', default: false })
  completedManually: boolean;

  @Column({ name: 'file_id', type: 'char', length: 36, nullable: true })
  fileId: string | null;

  /** 공고 유형 (announcement_category 1대다) */
  @ManyToOne(() => AnnouncementCategory, (cat) => cat.announcements)
  @JoinColumn({ name: 'category_id', referencedColumnName: 'categoryId' })
  category: AnnouncementCategory;

  @ManyToMany(() => Major)
  @JoinTable({
    name: 'announcement_major',
    joinColumn: { name: 'post_id', referencedColumnName: 'postId' },
    inverseJoinColumn: { name: 'major_id', referencedColumnName: 'majorId' },
  })
  majors: Major[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 대표 파일 (썸네일 등) — 추가 첨부는 `file` 테이블 `type`·`target_id`로 조회 */
  @ManyToOne(() => File, { nullable: true })
  @JoinColumn({ name: 'file_id' })
  file: File | null;

  /** 지원서 양식 (1:1) - application_config.post_id → announcement.post_id */
  @OneToOne(() => ApplicationConfig, (config) => config.announcement)
  applicationConfig: ApplicationConfig;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
