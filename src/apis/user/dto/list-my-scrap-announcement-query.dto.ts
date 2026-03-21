import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMyScrapAnnouncementQueryDto {
  @ApiPropertyOptional({
    description: '커서 (마지막으로 조회한 스크랩 생성 시각, ISO 8601)',
    example: '2026-03-21T10:00:00.000Z',
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
