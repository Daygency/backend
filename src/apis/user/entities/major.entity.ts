import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class Major {
  @PrimaryGeneratedColumn('uuid')
  majorId: string;

  @Column({ length: 100 })
  name: string;

  @OneToMany(() => User, (user) => user.major)
  users: User[];
}
