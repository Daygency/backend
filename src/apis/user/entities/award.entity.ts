import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class Award {
  @PrimaryGeneratedColumn('uuid')
  awardId: string;

  @Column({ length: 100 })
  description: string;

  @Column({ nullable: true })
  awardedAt: Date | null;

  @Column({ length: 10, nullable: true })
  organization: string | null;

  @ManyToOne(() => User, (user) => user.awards)
  @JoinColumn({ name: 'userId' })
  user: User;
}
