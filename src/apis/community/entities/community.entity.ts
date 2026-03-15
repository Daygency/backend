import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { File } from '../../file/entities/file.entity';
import { CommunityCategory } from './community-category.entity';

@Entity('community')
export class Community {
  @PrimaryGeneratedColumn('uuid', { name: 'community_id' })
  communityId: string;

  @Column({ length: 100 })
  title: string;

  @Column({ length: 255 })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => CommunityCategory, (cat) => cat.communities)
  @JoinColumn({ name: 'category_id', referencedColumnName: 'categoryId' })
  category: CommunityCategory;

  @ManyToOne(() => File)
  @JoinColumn({ name: 'file_id' })
  file: File;
}
