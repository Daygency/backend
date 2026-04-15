import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReviewRating } from '../entities/review.entity';

export class UpdateReviewDto {
  @ApiPropertyOptional({
    enum: ReviewRating,
    description: '미지정 시 기존 rating 유지',
  })
  @IsOptional()
  @IsEnum(ReviewRating)
  rating?: ReviewRating;

  @ApiPropertyOptional({
    description:
      '`DISAPPOINTING`일 때만: 아쉬움 사유 코드 배열 (지정 시 기존값 덮어씀)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  disappointmentReasonCodes?: string[];

  @ApiPropertyOptional({
    description:
      '운영팀 전용 메모(상대방 알림·푸시에 포함되지 않음). 지정 시 기존값 덮어씀',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNoteToOps?: string;
}
