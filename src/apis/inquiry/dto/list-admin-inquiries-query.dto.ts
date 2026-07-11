import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminInquiriesQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'answered', 'unanswered'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'answered', 'unanswered'])
  status?: 'all' | 'answered' | 'unanswered' = 'all';

  @ApiPropertyOptional({
    description: '다음 페이지 커서 (직전 응답의 nextCursor 값을 그대로 전달)',
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
}
