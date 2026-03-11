import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Career {
  @PrimaryGeneratedColumn('uuid')
  careerId: string;

  @Column({ length: 100 })
  description: string;

  @Column()
  startedAt: Date;

  @Column()
  endedAt: Date;
}
