import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Announcement } from './announcement.entity';

@Entity('announcement_category')
export class AnnouncementCategory {
  @PrimaryGeneratedColumn('uuid', { name: 'category_id' })
  categoryId: string;

  @Column({ length: 100 })
  name: string;

  @OneToMany('Announcement', 'category')
  announcements: Announcement[];
}
