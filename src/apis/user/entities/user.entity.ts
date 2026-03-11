import { Education } from 'src/apis/user/entities/education.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Career } from './career.entity';
import { Award } from './award.entity';

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

  @Column({ unique: true, length: 20 })
  nickname: string;

  @Column({ length: 100 })
  aboutMe: string;

  @Column({ length: 300 })
  selfIntroduction: string;

  @Column({ type: 'enum', enum: UserRole })
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

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
