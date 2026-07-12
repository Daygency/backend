import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMyScrapQueryDto {
  @ApiPropertyOptional({
    description: '커서 (마지막으로 조회한 항목의 스크랩 시각, ISO 8601)',
    example: '2026-03-21T10:00:00.000Z',
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
}
