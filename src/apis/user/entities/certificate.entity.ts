import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/apis/user/entities/user.entity';

@Entity()
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  certificateId: string;

  @Column({ length: 100 })
  description: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  obtainedAt: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  organization: string | null;

  @ManyToOne(() => User, (user) => user.certificates)
  @JoinColumn({ name: 'userId' })
  user: User;
}
