import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** 팔로우: sender_id → receiver_id (복합 PK) */
@Entity('follow')
export class Follow {
  @PrimaryColumn({ name: 'sender_id', type: 'char', length: 36 })
  senderId: string;

  @PrimaryColumn({ name: 'receiver_id', type: 'char', length: 36 })
  receiverId: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
  })
  createdAt: Date;
}
