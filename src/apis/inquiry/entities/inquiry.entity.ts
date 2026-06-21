import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('inquiry')
export class Inquiry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'image_urls', type: 'json', nullable: true })
  imageUrls: string[] | null;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ name: 'answered_at', type: 'datetime', precision: 6, nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;
}
