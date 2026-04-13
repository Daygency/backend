import {
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { ChatRoom } from './chat-room.entity';

/** 방–사용자 다대다 (현재는 1:1만 사용, 그룹 확장 시 동일 테이블) */
@Entity('chat_room_member')
@Unique('UQ_chat_room_member_room_user', ['chatRoom', 'user'])
export class ChatRoomMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ChatRoom, (room) => room.members)
  @JoinColumn({ name: 'chat_room_id' })
  chatRoom: ChatRoom;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId' })
  user: User;

  @CreateDateColumn({
    name: 'joined_at',
    type: 'datetime',
    precision: 6,
  })
  joinedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;
}
