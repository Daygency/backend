import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum ScrapTargetType {
  NEWS = 'NEWS',
  COMMUNITY = 'COMMUNITY',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

@Entity('scrap')
export class Scrap {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ScrapTargetType,
  })
  targetType: ScrapTargetType;

  @Column({ name: 'target_id', type: 'char', length: 36 })
  targetId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
