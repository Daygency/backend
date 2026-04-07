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

  @Column({ type: 'datetime', precision: 6 })
  startedAt: Date;

  @Column({ type: 'datetime', precision: 6 })
  endedAt: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  organization: string | null;

  @ManyToOne(() => User, (user) => user.careers)
  @JoinColumn({ name: 'userId' })
  user: User;
}
