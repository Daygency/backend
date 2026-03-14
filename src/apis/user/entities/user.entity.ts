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
import { Career } from './career.entity';
import { Award } from './award.entity';
import { Certificate } from './certificate.entity';
import { Major } from './major.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum SocialProvider {
  KAKAO = 'kakao',
  GOOGLE = 'google',
  NAVER = 'naver',
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

  @Column({ unique: true, length: 320 })
  email: string;

  @Column({ length: 13 })
  phoneNumber: string;

  @Column()
  artTempo: number;

  @Column()
  profileImgUrl: string;

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
