import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/apis/user/entities/user.entity';

@Entity()
export class Education {
  @PrimaryGeneratedColumn('uuid')
  educationId: string;

  @Column({ length: 100 })
  description: string;

  @Column()
  startedAt: Date;

  @Column()
  endedAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @ManyToOne(() => User, (user) => user.educations, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}
