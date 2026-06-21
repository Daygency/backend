import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('home_banner')
export class HomeBanner {
  @PrimaryGeneratedColumn('uuid')
  bannerId: string;

  @Column({ length: 120 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  /** 썸네일 — imageUrls[0] 과 동기화 */
  @Column({ length: 512 })
  imageUrl: string;

  @Column({ type: 'json', nullable: true })
  imageUrls: string[] | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  endsAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
