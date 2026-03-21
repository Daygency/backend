import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * 공연소식 목록 조회 Query DTO (무한스크롤)
 */
export class ListNewsQueryDto {
  @ApiPropertyOptional({
    description: '커서 (마지막으로 조회한 news_id). 없으면 첫 페이지',
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
}
