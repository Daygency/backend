import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Notice } from './notice.entity';

@Entity('notice_recipient')
export class NoticeRecipient {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => Notice, (n) => n.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notice_id' })
  notice: Notice;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: User;

  @Column({ name: 'read_at', type: 'datetime', nullable: true })
  readAt: Date | null;
}
