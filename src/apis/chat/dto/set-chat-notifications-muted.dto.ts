import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetChatNotificationsMutedDto {
  @ApiProperty({ description: 'true면 이 방 알림 끔' })
  @IsBoolean()
  muted: boolean;
}
