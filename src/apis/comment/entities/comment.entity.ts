import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum CommentTargetType {
  NEWS = 'NEWS',
  COMMUNITY = 'COMMUNITY',
}

@Entity('comment')
export class Comment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ length: 255 })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: CommentTargetType,
  })
  targetType: CommentTargetType;

  @Column({ name: 'target_id', type: 'char', length: 36 })
  targetId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'parent_id', type: 'char', length: 36, nullable: true })
  parentId: string | null;
}
