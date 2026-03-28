import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { NoticeRecipient } from './notice-recipient.entity';

export enum NoticeTargetType {
  COMMENT = 'COMMENT',
  FOLLOW = 'FOLLOW',
  APPLICATION = 'APPLICATION',
}

@Entity('notice')
export class Notice {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  actorUser: User;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: NoticeTargetType,
  })
  targetType: NoticeTargetType;

  @Column({ name: 'target_id', type: 'char', length: 36 })
  targetId: string;

  /** 인박스·푸시에 동일하게 사용하는 문구 (ERD 20자는 푸시에 부족해 500으로 확장) */
  @Column({ name: 'content', type: 'varchar', length: 500, nullable: true })
  content: string | null;

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

  @OneToMany(() => NoticeRecipient, (r) => r.notice)
  recipients: NoticeRecipient[];
}
