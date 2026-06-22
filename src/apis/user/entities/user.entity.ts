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

  @Column({ type: 'varchar', length: 20, nullable: true })
  name: string | null;

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

  /** 신고 누적 1주 정지 만료 시각 — null 이면 영구 정지(관리자) 또는 정상 */
  @Column({
    name: 'report_banned_until',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  reportBannedUntil: Date | null;

  /** 이 시각 이후 접수된 신고만 누적 카운트 (정지 해제 시 갱신) */
  @Column({
    name: 'report_strike_reset_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  reportStrikeResetAt: Date | null;

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

  @Column({ name: 'is_portfolio_private', default: false })
  isPortfolioPrivate: boolean;

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
