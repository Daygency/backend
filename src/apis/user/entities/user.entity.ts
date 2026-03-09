import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

enum UserRole {
  ADMIN = 'admin',
  ARTIST = 'artist',
  PLANNER = 'planner',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  userId: string;

  @Column({ unique: true, length: 20 })
  nickname: string;

  @Column({ length: 100 })
  aboutMe: string;

  @Column({ unique: true, length: 320 })
  email: string;

  @Column({ enum: UserRole })
  role: UserRole;

  @Column({ length: 13 })
  phoneNumber: string;

  @Column()
  isEmailSubscribed: boolean;

  @Column()
  isPushEnabled: boolean;

  @Column()
  artTempo: number;

  @Column()
  profileImgUrl: string;

  @Column()
  createdAt: Date;
}
