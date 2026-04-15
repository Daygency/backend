import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ReviewRating } from '../entities/review.entity';

export class CreateReviewDto {
  @ApiProperty({ description: '후기를 받는 상대방 userId (파트너)' })
  @IsUUID()
  revieweeUserId: string;

  @ApiProperty({ enum: ReviewRating })
  @IsEnum(ReviewRating)
  rating: ReviewRating;

  @ApiPropertyOptional({
    description:
      '`DISAPPOINTING`일 때만: 아쉬움 사유 코드 배열 (TIME_NOT_KEPT 등)',
    type: [String],
  })
  @ValidateIf(
    (o: CreateReviewDto) => o.rating === ReviewRating.DISAPPOINTING,
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  disappointmentReasonCodes?: string[];

  @ApiPropertyOptional({
    description:
      '운영팀 전용 메모(상대방 알림·푸시에 포함되지 않음). 아쉬움 플로우 자유 입력.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNoteToOps?: string;
}
