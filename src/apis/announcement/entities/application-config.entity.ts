import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Announcement } from './announcement.entity';

/**
 * 지원서 양식 (application_config)
 * 모집공고와 1:1 관계 - 각 공고당 하나의 지원서 양식 설정.
 * include_* 가 true 인 항목은 지원 시 모두 필수 입력으로 검증된다.
 */
@Entity('application_config')
export class ApplicationConfig {
  @PrimaryColumn({ name: 'post_id', type: 'char', length: 36 })
  postId: string;

  @Column({ name: 'include_name', type: 'tinyint', default: false })
  includeName: boolean;

  @Column({ name: 'include_birth', type: 'tinyint', default: false })
  includeBirth: boolean;

  @Column({ name: 'include_gender', type: 'tinyint', default: false })
  includeGender: boolean;

  @Column({ name: 'include_major', type: 'tinyint', default: false })
  includeMajor: boolean;

  @Column({ name: 'include_major_detail', type: 'tinyint', default: false })
  includeMajorDetail: boolean;

  @Column({ name: 'include_education', type: 'tinyint', default: false })
  includeEducation: boolean;

  @Column({ name: 'include_category', type: 'tinyint', default: false })
  includeCategory: boolean;

  @Column({ name: 'include_music', type: 'tinyint', default: false })
  includeMusic: boolean;

  @Column({ name: 'include_address', type: 'tinyint', default: false })
  includeAddress: boolean;

  @Column({ name: 'include_file', type: 'tinyint', default: false })
  includeFile: boolean;

  @Column({ name: 'include_link', type: 'tinyint', default: false })
  includeLink: boolean;

  @Column({ name: 'include_department', type: 'tinyint', default: false })
  includeDepartment: boolean;

  @Column({ name: 'include_career', type: 'tinyint', default: false })
  includeCareer: boolean;

  @Column({ name: 'include_introduce', type: 'tinyint', default: false })
  includeIntroduce: boolean;

  @OneToOne(
    () => Announcement,
    (announcement) => announcement.applicationConfig,
  )
  @JoinColumn({ name: 'post_id' })
  announcement: Announcement;
}
