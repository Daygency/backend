import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
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

  /** 대표 파일 (썸네일 등) - file_id. 하위 파일은 File.children (parent_id=self) */
  @ManyToOne(() => File, { nullable: true })
  @JoinColumn({ name: 'file_id' })
  file: File | null;

  /** 지원서 양식 (1:1) - application_config.post_id → announcement.post_id */
  @OneToOne(() => ApplicationConfig, (config) => config.announcement)
  applicationConfig: ApplicationConfig;
}
