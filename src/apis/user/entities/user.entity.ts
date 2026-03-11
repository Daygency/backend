import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  ARTIST = 'artist',
  PLANNER = 'planner',
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

  @Column({ type: 'text', nullable: true })
  education: string | null;

  @Column({ type: 'text', nullable: true })
  career: string | null;

  @Column({ type: 'text', nullable: true })
  awards: string | null;

  @Column({ unique: true, length: 320 })
  email: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ length: 13 })
  phoneNumber: string;

  @Column()
  isEmailSubscribed: boolean;

  @Column()
  isPushEnabled: boolean;

  @Column()
  artTempo: number;

  @Column()
  profileImgUrl: string;

  @Column()
  socialId: string;

  @Column({ type: 'enum', enum: SocialProvider })
  socialProvider: SocialProvider;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
