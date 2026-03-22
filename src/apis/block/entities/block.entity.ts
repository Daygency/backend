import { Column, Entity, PrimaryColumn } from 'typeorm';

/** 차단: blocker_id 가 blocked_id 를 차단 (복합 PK) */
@Entity('block')
export class Block {
  @PrimaryColumn({ name: 'blocker_id', type: 'char', length: 36 })
  blockerId: string;

  @PrimaryColumn({ name: 'blocked_id', type: 'char', length: 36 })
  blockedId: string;

  @Column({ name: 'block_at', type: 'datetime', precision: 6 })
  blockAt: Date;
}
