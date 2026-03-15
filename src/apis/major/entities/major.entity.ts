import {
  Column,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Announcement } from '../../announcement/entities/announcement.entity';
import type { User } from '../../user/entities/user.entity';

@Entity('major')
export class Major {
  @PrimaryGeneratedColumn('uuid', { name: 'major_id' })
  majorId: string;

  @Column({ length: 100 })
  name: string;

  @OneToMany('User', 'major')
  users: User[];

  @ManyToMany('Announcement', 'majors')
  announcements: Announcement[];
}
