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

/** 커피챗(1:1) / 모집공고 그룹채팅 — 참가자는 `chat_room_member` */
export enum ChatRoomKind {
  COFFEE = 'COFFEE',
  /** @deprecated 레거시 — 공고당 지원자 1인 1:1 스레드. `GROUP`으로 대체됨, 신규 생성 안 함 */
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  /** 공고 1건당 방 1개 — 작성자 + 수락된 지원자 전원 (다대다) */
  GROUP = 'GROUP',
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
   * 레거시 ANNOUNCEMENT: 지원서(application) 1건당 스레드 1개 — FK `form_id`
   * COFFEE / GROUP: null (GROUP은 공고당 방 1개라 특정 지원서에 묶이지 않음)
   */
  @ManyToOne(() => Application, { nullable: true })
  @JoinColumn({ name: 'form_id', referencedColumnName: 'id' })
  application: Application | null;

  /** ANNOUNCEMENT/GROUP: 공고 — `post_id` FK (COFFEE: null) */
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
