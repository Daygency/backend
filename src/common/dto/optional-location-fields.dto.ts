import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 장소 좌표 (카카오맵 검색 결과). 둘 다 있거나 둘 다 없어야 함. */
export class OptionalLocationFieldsDto {
  @ApiPropertyOptional({
    description: '위도 (카카오맵 검색 시)',
    nullable: true,
    example: 37.5665,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    description: '경도 (카카오맵 검색 시)',
    nullable: true,
    example: 126.978,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
