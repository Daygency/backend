import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class SendAdminNotificationDto {
  @ApiProperty({ description: '푸시/인박스에 표시할 제목' })
  @IsString()
  @Length(1, 100)
  title: string;

  @ApiProperty({ description: '푸시/인박스에 표시할 본문' })
  @IsString()
  @Length(1, 500)
  body: string;
}
