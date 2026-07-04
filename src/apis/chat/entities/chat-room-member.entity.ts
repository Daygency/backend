import {
  Column,
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

  /** 이 방의 새 메시지 푸시/알림 수신 여부 (false = 알림 받음) */
  @Column({ name: 'notifications_muted', type: 'boolean', default: false })
  notificationsMuted: boolean;

  /**
   * 이 방에서 내가 마지막으로 읽은 메시지의 createdAt (읽음 커서).
   * 그룹 채팅 확장 시에도 멤버 1인당 1개 커서로 그대로 사용 가능.
   */
  @Column({
    name: 'last_read_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastReadAt: Date | null;
}
