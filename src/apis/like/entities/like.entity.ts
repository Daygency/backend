import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum LikeType {
  NEWS = 'NEWS',
  COMMUNITY = 'COMMUNITY',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  COMMENT = 'COMMENT',
}

@Entity('like')
export class Like {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({
    name: 'like_type',
    type: 'enum',
    enum: LikeType,
  })
  likeType: LikeType;

  @Column({ name: 'target_id', type: 'char', length: 36 })
  targetId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
