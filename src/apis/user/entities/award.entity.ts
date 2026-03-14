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

  @Column()
  awardedAt: Date;

  @ManyToOne(() => User, (user) => user.awards)
  @JoinColumn({ name: 'userId' })
  user: User;
}
