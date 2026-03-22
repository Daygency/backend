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
import { Announcement } from '../../announcement/entities/announcement.entity';
import { Message } from './message.entity';

/** 커피챗 등 일반 1:1 / 모집공고 지원자–작성자 1:1 */
export enum ChatRoomKind {
  COFFEE = 'COFFEE',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
}

@Entity('chat_room')
@Unique('UQ_chat_room_coffee_pair', ['participantLowId', 'participantHighId'])
@Unique('UQ_chat_room_announcement_applicant', ['postId', 'applicantUserId'])
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ChatRoomKind,
    name: 'kind',
  })
  kind: ChatRoomKind;

  /** COFFEE: 두 사용자 ID (정렬됨: low ≤ high 문자열 기준) */
  @Column({
    name: 'participant_low_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  participantLowId: string | null;

  @Column({
    name: 'participant_high_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  participantHighId: string | null;

  /** ANNOUNCEMENT: 공고 + 지원자 1명당 방 하나 */
  @Column({ name: 'post_id', type: 'char', length: 36, nullable: true })
  postId: string | null;

  @Column({
    name: 'applicant_user_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  applicantUserId: string | null;

  @Column({ name: 'form_id', type: 'char', length: 36, nullable: true })
  formId: string | null;

  @ManyToOne(() => Announcement, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id', referencedColumnName: 'postId' })
  announcement: Announcement | null;

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
