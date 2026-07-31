import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  AnnouncementPriceType,
  AnnouncementStatus,
} from '../entities/announcement.entity';

export const ANNOUNCEMENT_LIST_SORT_VALUES = ['created', 'imminent'] as const;
export type AnnouncementListSort =
  (typeof ANNOUNCEMENT_LIST_SORT_VALUES)[number];

export const APPLICATION_REVIEW_FILTER_VALUES = [
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
] as const;
export type ApplicationReviewFilter =
  (typeof APPLICATION_REVIEW_FILTER_VALUES)[number];

/**
 * 공고 목록 조회 Query DTO (무한스크롤 + 필터)
 *
 * 무한스크롤: cursor = 마지막 post_id, limit = 페이지 크기
 * 필터: status, categoryId, majorIds, priceType
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
    default: 8,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : 8))
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 8;

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

  @ApiPropertyOptional({
    enum: AnnouncementPriceType,
    description:
      '금액 구분 필터. FREE, INCOME(페이), PENDING(비용협의). EXPENSE는 레거시 데이터 조회용',
  })
  @IsOptional()
  @IsEnum(AnnouncementPriceType)
  priceType?: AnnouncementPriceType;

  /** 모집 전공 ID (여러 개 선택 시 콤마 구분) */
  @ApiPropertyOptional({
    description: '모집 전공 ID. 복수 선택 시 콤마 구분 (예: uuid1,uuid2,uuid3)',
    example:
      '550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsString()
  majorIds?: string;

  @ApiPropertyOptional({
    description: '제목·본문·주소 키워드 검색 (부분 일치)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      '정렬 — created: 등록순(기본), imminent: 임박순(마감일 오름차순, 마감 지난 공고 제외)',
    enum: ANNOUNCEMENT_LIST_SORT_VALUES,
    default: 'created',
  })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_LIST_SORT_VALUES)
  sort?: AnnouncementListSort = 'created';

  /** 완료(활동종료) 여부 필터 — `/announcement/my`, `/announcement/applied` 전용 */
  @ApiPropertyOptional({
    description:
      '완료(활동종료) 여부 필터. true: 활동 종료된 공고만, false: 진행 중인 공고만',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  completed?: boolean;

  /** 지원 심사 상태 필터 — `/announcement/applied` 전용 */
  @ApiPropertyOptional({
    enum: APPLICATION_REVIEW_FILTER_VALUES,
    description:
      '지원 심사 상태 필터. UNDER_REVIEW: 검토중(SUBMITTED+DOCUMENT_REVIEW), ACCEPTED: 수락됨, REJECTED: 거절됨',
  })
  @IsOptional()
  @IsIn(APPLICATION_REVIEW_FILTER_VALUES)
  applicationStatus?: ApplicationReviewFilter;
}
