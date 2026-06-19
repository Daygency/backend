import { Award } from 'src/apis/user/entities/award.entity';
import { Career } from 'src/apis/user/entities/career.entity';
import { Certificate } from 'src/apis/user/entities/certificate.entity';
import { Education } from 'src/apis/user/entities/education.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Major } from '../../major/entities/major.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum SocialProvider {
  KAKAO = 'kakao',
  GOOGLE = 'google',
  NAVER = 'naver',
}

/** 계정 조치 상태 (신고 누적 등) */
export enum UserActivity {
  NORMAL = 'NORMAL',
  FLAGGED = 'FLAGGED',
  BAN = 'BAN',
}

@Entity()
@Unique(['socialProvider', 'socialId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  userId: string;

  @Column({ length: 20 })
  nickname: string;

  @Column({ unique: true, length: 20 })
  activityName: string;

  @Column({ length: 100, nullable: true })
  aboutMe: string;

  @Column({ length: 300, nullable: true })
  selfIntroduction: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserActivity,
    default: UserActivity.NORMAL,
  })
  activity: UserActivity;

  @Column({ unique: true, length: 320 })
  email: string;

  @Column({ length: 13 })
  phoneNumber: string;

  @Column()
  artTempo: number;

  @Column()
  profileImgUrl: string;

  @Column({ name: 'cover_img_url', type: 'varchar', length: 512, default: '' })
  coverImgUrl: string;

  @Column()
  isEmailSubscribed: boolean;

  @Column()
  isPushEnabled: boolean;

  @Column()
  socialId: string;

  @Column({ type: 'enum', enum: SocialProvider })
  socialProvider: SocialProvider;

  @OneToMany(() => Education, (education) => education.user)
  educations: Education[];

  @OneToMany(() => Career, (career) => career.user)
  careers: Career[];

  @OneToMany(() => Award, (award) => award.user)
  awards: Award[];

  @OneToMany(() => Certificate, (certificate) => certificate.user)
  certificates: Certificate[];

  @ManyToOne(() => Major, (major) => major.users)
  major: Major;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
