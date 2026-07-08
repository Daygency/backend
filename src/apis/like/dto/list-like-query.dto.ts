import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { LikeType } from '../entities/like.entity';

export class ListLikeQueryDto {
  @IsEnum(LikeType)
  likeType: LikeType;

  @IsUUID()
  targetId: string;

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
}
