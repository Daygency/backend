import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Community } from './community.entity';

@Entity('community_category')
export class CommunityCategory {
  @PrimaryGeneratedColumn('uuid', { name: 'category_id' })
  categoryId: string;

  @Column({ name: 'name', length: 20 })
  name: string;

  @OneToMany('Community', 'category')
  communities: Community[];
}
