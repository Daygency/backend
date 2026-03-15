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
import { Major } from '../../major/entities/major.entity';

export enum AnnouncementStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** 공고 유형 - 선택 태그 기준 */
export enum AnnouncementType {
  AUDITION = 'AUDITION', // 오디션(연주자모집)
  COMPETITION = 'COMPETITION', // 콩쿨(경연)
  ADMISSION_EVAL = 'ADMISSION_EVAL', // 입시평가회
  MASTERCLASS = 'MASTERCLASS', // 마스터클래스
  EVENT = 'EVENT', // 행사
  STAFF_RECRUIT = 'STAFF_RECRUIT', // 스탭구인
  ETC = 'ETC', // 기타
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

  @Column({ name: 'file_id', type: 'char', length: 36 })
  fileId: string;

  /** 공고 유형 (필터용) - DB에 컬럼 추가 필요 */
  @Column({
    name: 'type',
    type: 'enum',
    enum: AnnouncementType,
    nullable: true,
  })
  type: AnnouncementType | null;

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
  @ManyToOne(() => File)
  @JoinColumn({ name: 'file_id' })
  file: File;

  /** 지원서 양식 (1:1) - application_config.post_id → announcement.post_id */
  @OneToOne(() => ApplicationConfig, (config) => config.announcement)
  applicationConfig: ApplicationConfig;
}
