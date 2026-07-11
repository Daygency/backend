import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListReviewsQueryDto {
  @ApiPropertyOptional({
    description:
      '다음 페이지 커서(직전 응답 nextCursor). createdAt + reviewId를 인코딩한 값',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 8;

  @ApiPropertyOptional({
    description: '받은 후기 목록에서 프로필에 숨긴 후기만 조회 (본인 전용)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hiddenOnly?: boolean;
}
