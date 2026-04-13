import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Application } from '../../application/entities/application.entity';
import { Announcement } from '../../announcement/entities/announcement.entity';
import { ChatRoomMember } from './chat-room-member.entity';
import { Message } from './message.entity';

/** 커피챗 / 모집공고 스레드 등 — 참가자는 `chat_room_member` */
export enum ChatRoomKind {
  COFFEE = 'COFFEE',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

@Entity('chat_room')
@Unique('UQ_chat_room_application', ['application'])
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ChatRoomKind,
    name: 'kind',
  })
  kind: ChatRoomKind;

  /**
   * ANNOUNCEMENT: 지원서(application) 1건당 스레드 1개 — FK `form_id`
   * COFFEE: null
   */
  @ManyToOne(() => Application, { nullable: true })
  @JoinColumn({ name: 'form_id', referencedColumnName: 'id' })
  application: Application | null;

  /** ANNOUNCEMENT: 공고 — `post_id` FK (COFFEE: null) */
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
