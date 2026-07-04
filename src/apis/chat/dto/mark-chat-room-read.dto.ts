import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MarkChatRoomReadDto {
  @ApiPropertyOptional({
    description: '여기까지 읽었다고 표시할 메시지 ID. 생략 시 방의 최신 메시지 기준',
  })
  @IsOptional()
  @IsUUID()
  lastMessageId?: string;
}
