import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterPushDeviceDto {
  @ApiProperty({ description: '등록 해제할 FCM 토큰' })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  fcmToken: string;
}
