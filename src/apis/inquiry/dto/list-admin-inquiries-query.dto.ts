import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListAdminInquiriesQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'answered', 'unanswered'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'answered', 'unanswered'])
  status?: 'all' | 'answered' | 'unanswered' = 'all';
}
