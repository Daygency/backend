import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 첨부 대상 도메인 — DB 컬럼 `type`(enum: NEWS, COMMUNITY, ANNOUNCEMENT) */
export enum FileTargetType {
  NEWS = 'NEWS',
  COMMUNITY = 'COMMUNITY',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

@Entity('file')
export class File {
  @PrimaryGeneratedColumn('uuid', { name: 'file_id' })
  fileId: string;

  @Column({ name: 'img_url' })
  imgUrl: string;

  @Column({ name: 'original_name', length: 100 })
  originalName: string;

  /** 저장 순서 (동일 target 내 정렬) — DB 컬럼명 `order` */
  @Column({ name: 'order', type: 'int' })
  sortOrder: number;

  @Column({ name: 'stored_name', length: 100 })
  storedName: string;

  @Column({ name: 'extention', length: 5 })
  extention: string;

  @Column({
    name: 'type',
    type: 'enum',
    enum: FileTargetType,
    nullable: true,
  })
  targetType: FileTargetType | null;

  @Column({ name: 'target_id', type: 'char', length: 36, nullable: true })
  targetId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
