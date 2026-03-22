import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageSocketDto {
  @IsUUID()
  chatRoomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  content?: string;
}
