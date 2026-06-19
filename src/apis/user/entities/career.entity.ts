import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/apis/user/entities/user.entity';

@Entity()
export class Career {
  @PrimaryGeneratedColumn('uuid')
  careerId: string;

  @Column({ length: 100 })
  description: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  endedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  isOngoing: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  organization: string | null;

  @ManyToOne(() => User, (user) => user.careers)
  @JoinColumn({ name: 'userId' })
  user: User;
}
