import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReviewRating } from '../entities/review.entity';
import {
  REVIEW_DISAPPOINTMENT_REASON_VALUES,
  REVIEW_POSITIVE_REASON_VALUES,
} from '../review.constants';

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
      '`DISAPPOINTING`일 때만: 아쉬움 사유 코드 배열 (지정 시 기존값 덮어씀). null 허용.',
    type: [String],
    enum: REVIEW_DISAPPOINTMENT_REASON_VALUES,
    nullable: true,
    example: ['REQUESTS_NOT_REFLECTED', 'PROBLEM_RESPONSE_WEAK'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(REVIEW_DISAPPOINTMENT_REASON_VALUES, { each: true })
  disappointmentReasonCodes?: string[] | null;

  @ApiPropertyOptional({
    description:
      '운영팀 전용 메모(상대방 알림·푸시에 포함되지 않음). 지정 시 기존값 덮어씀, null 허용.',
    maxLength: 2000,
    nullable: true,
    example: '요청 전달이 늦어서 준비 일정이 촉박했어요.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  privateNoteToOps?: string | null;

  @ApiPropertyOptional({
    description:
      '`GOOD`/`IMPRESSED`일 때만: 좋았던 점 코드 배열(지정 시 기존값 덮어씀). null 허용.',
    type: [String],
    enum: REVIEW_POSITIVE_REASON_VALUES,
    nullable: true,
    example: ['POLITE_AND_CONSIDERATE', 'CALM_PROBLEM_SOLVING'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(REVIEW_POSITIVE_REASON_VALUES, { each: true })
  positiveReasonCodes?: string[] | null;

  @ApiPropertyOptional({
    description:
      '`GOOD`/`IMPRESSED`일 때 공개되는 후기 본문. 지정 시 기존값 덮어씀, null 허용.',
    maxLength: 2000,
    nullable: true,
    example: '전체 진행이 매끄럽고 배려가 느껴졌습니다.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  publicNote?: string | null;
}
