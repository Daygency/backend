import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * 유저 목록 (가입일 최신순, 무한스크롤)
 *
 * - cursor: 이전 응답의 nextCursor (첫 요청은 생략)
 * - majorIds: 콤마로 구분한 전공 UUID. 지정 시 해당 전공 중 하나라도 일치하는 유저만 (OR)
 */
export class ListUsersQueryDto {
  @ApiPropertyOptional({
    description: '다음 페이지 커서 (직전 응답의 nextCursor 값을 그대로 전달)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      '전공 ID 여러 개 (콤마 구분). 예: uuid1,uuid2 — 해당 전공 중 하나에 속한 유저만',
    example:
      '550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsString()
  majorIds?: string;

  @ApiPropertyOptional({
    description: '닉네임·활동명·소개 키워드 검색 (부분 일치)',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
