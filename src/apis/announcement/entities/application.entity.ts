import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Announcement } from './announcement.entity';
import { User } from '../../user/entities/user.entity';

/** 지원서 응답 성별 (지원폼 테이블) */
export enum ApplicationGender {
  FEMALE = 'FEMALE',
  MALE = 'MALE',
  NONE = 'NONE',
}

/**
 * 지원폼 (application) — 모집자가 application_config로 받기로 한 항목에 대한 지원자 응답
 * 컬럼명은 양식(application_config)의 include_* 와 대응하되, 여기서는 실제 값이 들어감
 */
@Entity('application')
@Unique('UQ_application_post_applicant', ['postId', 'userId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'include_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  includeName: string | null;

  @Column({
    name: 'include_birth',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  includeBirth: string | null;

  @Column({
    name: 'include_gender',
    type: 'enum',
    enum: ApplicationGender,
    nullable: true,
  })
  includeGender: ApplicationGender | null;

  @Column({
    name: 'include_major',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  includeMajor: string | null;

  @Column({
    name: 'include_major_detail',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  includeMajorDetail: string | null;

  @Column({
    name: 'include_education',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  includeEducation: string | null;

  @Column({
    name: 'include_category',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  includeCategory: string | null;

  @Column({
    name: 'include_music',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  includeMusic: string | null;

  @Column({
    name: 'include_address',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  includeAddress: string | null;

  /** 사진/영상/파일 첨부 여부 등 (ERD: tinyint) */
  @Column({ name: 'include_file', type: 'tinyint', width: 1, nullable: true })
  includeFile: number | null;

  @Column({
    name: 'include_link',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  includeLink: string | null;

  @Column({
    name: 'include_department',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  includeDepartment: string | null;

  /** 경력 관련 (ERD: tinyint — 플래그로 사용) */
  @Column({ name: 'include_career', type: 'tinyint', width: 1, nullable: true })
  includeCareer: number | null;

  @Column({
    name: 'include_introduce',
    type: 'varchar',
    length: 2000,
    nullable: true,
  })
  includeIntroduce: string | null;

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
