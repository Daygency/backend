import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Announcement } from '../../announcement/entities/announcement.entity';
import { ChatRoomMember } from './chat-room-member.entity';
import { Message } from './message.entity';

/** 커피챗(1:1) / 모집공고 그룹채팅 — 참가자는 `chat_room_member` */
export enum ChatRoomKind {
  COFFEE = 'COFFEE',
  /** 공고 1건당 방 1개 — 작성자 + 수락된 지원자 전원 (다대다) */
  GROUP = 'GROUP',
}

@Entity('chat_room')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ChatRoomKind,
    name: 'kind',
  })
  kind: ChatRoomKind;

  /** GROUP: 공고 — `post_id` FK (COFFEE: null) */
  @ManyToOne(() => Announcement, { nullable: true })
  @JoinColumn({ name: 'post_id', referencedColumnName: 'postId' })
  announcement: Announcement | null;

  @OneToMany(() => ChatRoomMember, (m) => m.chatRoom)
  members: ChatRoomMember[];

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => Message, (message) => message.chatRoom)
  messages: Message[];
}
