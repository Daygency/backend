import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class Career {
  @PrimaryGeneratedColumn('uuid')
  careerId: string;

  @Column({ length: 100 })
  description: string;

  @Column()
  startedAt: Date;

  @Column()
  endedAt: Date;

  @Column({ length: 10, nullable: true })
  organization: string | null;

  @ManyToOne(() => User, (user) => user.careers)
  @JoinColumn({ name: 'userId' })
  user: User;
}
