import { IsUUID } from 'class-validator';

export class JoinRoomSocketDto {
  @IsUUID()
  chatRoomId: string;
}
