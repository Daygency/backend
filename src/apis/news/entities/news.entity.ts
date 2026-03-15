import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { File } from '../../file/entities/file.entity';

@Entity('news')
export class News {
  @PrimaryGeneratedColumn('uuid', { name: 'news_id' })
  newsId: string;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 255 })
  content: string;

  @Column({ length: 100 })
  place: string;

  @Column({ name: 'ticket_price', type: 'int', nullable: true })
  ticketPrice: number | null;

  @Column({ name: 'started_at', type: 'datetime', precision: 6 })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true })
  endedAt: Date | null;

  @Column({ length: 30 })
  contact: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => File)
  @JoinColumn({ name: 'file_id' })
  file: File;
}
