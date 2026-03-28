import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PushDevicePlatform } from '../entities/user-push-device.entity';

export class RegisterPushDeviceDto {
  @ApiProperty({ description: 'FCM 등록 토큰' })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  fcmToken: string;

  @ApiPropertyOptional({ enum: PushDevicePlatform })
  @IsOptional()
  @IsEnum(PushDevicePlatform)
  platform?: PushDevicePlatform;
}
