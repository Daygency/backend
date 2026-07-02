import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('announcement_pick')
export class AnnouncementPick {
  @PrimaryGeneratedColumn('uuid')
  pickId: string;

  @Column({ length: 80 })
  organizerName: string;

  @Column({ length: 120 })
  title: string;

  @Column({ type: 'json' })
  keywords: string[];

  @Column({ type: 'datetime' })
  deadlineAt: Date;

  @Column({ length: 512 })
  imageUrl: string;

  @Column({ length: 512 })
  linkUrl: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
