import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyInquiryDto {
  @ApiProperty({ description: '관리자 답변', maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  answer: string;
}
