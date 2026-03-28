import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum PushDevicePlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  WEB = 'WEB',
}

/** FCM 등록 토큰 보관 (ERD에 없음 — 푸시 발송에 필요) */
@Entity('user_push_device')
@Unique(['fcmToken'])
export class UserPushDevice {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: User;

  @Column({ name: 'fcm_token', type: 'varchar', length: 512 })
  fcmToken: string;

  @Column({
    name: 'platform',
    type: 'enum',
    enum: PushDevicePlatform,
    nullable: true,
  })
  platform: PushDevicePlatform | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
  })
  updatedAt: Date;
}
