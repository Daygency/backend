import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('file')
export class File {
  @PrimaryGeneratedColumn('uuid', { name: 'file_id' })
  fileId: string;

  @Column({ name: 'img_url' })
  imgUrl: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'original_name', length: 100 })
  originalName: string;

  @Column({ name: 'stored_name', length: 100 })
  storedName: string;

  @Column({ name: 'extention', length: 5 })
  extention: string;

  @Column({ name: 'parent_id', type: 'char', length: 36, nullable: true })
  parentId: string | null;

  /** 부모 파일 (self-join) - parent_id가 null이면 최상위, 있으면 해당 부모의 자식 */
  @ManyToOne(() => File, (file) => file.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: File | null;

  /** 자식 파일들 - 이 파일을 parent_id로 참조하는 파일들 */
  @OneToMany(() => File, (file) => file.parent)
  children: File[];
}
