import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AnnouncementStatus } from '../entities/announcement.entity';

/**
 * 공고 목록 조회 Query DTO (무한스크롤 + 필터)
 *
 * 무한스크롤: cursor = 마지막 post_id, limit = 페이지 크기
 * 필터: status, type, major (선택 태그 기준)
 */
export class ListAnnouncementQueryDto {
  @ApiPropertyOptional({
    description: '커서 (마지막으로 조회한 post_id). 없으면 첫 페이지',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: '한 번에 가져올 개수',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : 20))
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  /** 모집 상태: OPEN(모집중), CLOSED(모집마감) */
  @ApiPropertyOptional({
    enum: AnnouncementStatus,
    description: '모집 상태 필터',
  })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  /** 공고 유형 ID (announcement_category.category_id) */
  @ApiPropertyOptional({
    description: '공고 유형 ID로 필터',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** 모집 전공 ID (여러 개 선택 시 콤마 구분) */
  @ApiPropertyOptional({
    description: '모집 전공 ID. 복수 선택 시 콤마 구분 (예: uuid1,uuid2,uuid3)',
    example:
      '550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsString()
  majorIds?: string;
}
