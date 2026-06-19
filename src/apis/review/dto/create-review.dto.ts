import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ReviewRating } from '../entities/review.entity';
import {
  REVIEW_DISAPPOINTMENT_REASON_VALUES,
  REVIEW_POSITIVE_REASON_VALUES,
} from '../review.constants';

export class CreateReviewDto {
  @ApiProperty({ description: '후기를 받는 상대방 userId (파트너)' })
  @IsUUID()
  revieweeUserId: string;

  @ApiProperty({ enum: ReviewRating })
  @IsEnum(ReviewRating)
  rating: ReviewRating;

  @ApiPropertyOptional({
    description:
      '`DISAPPOINTING`일 때만: 아쉬움 사유 코드 배열. 그 외 평점이면 null/미전송.',
    type: [String],
    enum: REVIEW_DISAPPOINTMENT_REASON_VALUES,
    nullable: true,
    example: ['TIME_NOT_KEPT', 'COMMUNICATION'],
  })
  @ValidateIf(
    (o: CreateReviewDto) => o.rating === ReviewRating.DISAPPOINTING,
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(REVIEW_DISAPPOINTMENT_REASON_VALUES, { each: true })
  disappointmentReasonCodes?: string[] | null;

  @ApiPropertyOptional({
    description:
      '운영팀 전용 메모(상대방 알림·푸시에 포함되지 않음). null 또는 미전송 가능.',
    maxLength: 2000,
    nullable: true,
    example: '다음에는 일정 변경 시 더 빠른 안내가 필요했어요.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNoteToOps?: string | null;

  @ApiPropertyOptional({
    description:
      '`GOOD`/`IMPRESSED`일 때만: 좋았던 점 체크 항목 코드 배열. 그 외 평점이면 null/미전송.',
    type: [String],
    enum: REVIEW_POSITIVE_REASON_VALUES,
    nullable: true,
    example: ['SMOOTH_COMMUNICATION', 'WELL_PREPARED'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(REVIEW_POSITIVE_REASON_VALUES, { each: true })
  positiveReasonCodes?: string[] | null;

  @ApiPropertyOptional({
    description:
      '`GOOD`/`IMPRESSED`일 때 공개되는 후기 본문 텍스트. null 또는 미전송 가능.',
    nullable: true,
    maxLength: 2000,
    example: '덕분에 연주가 정말 편안하고 즐거웠습니다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  publicNote?: string | null;
}
