import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetPushEnabledDto {
  @ApiProperty({ description: 'true면 실제 알림(댓글/팔로우 등) 발송 대상에 포함' })
  @IsBoolean()
  isPushEnabled: boolean;
}
