import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMyWrittenPostsQueryDto {
  @ApiPropertyOptional({
    description: '커뮤니티 섹션 다음 페이지 커서 (직전 응답 community.nextCursor)',
  })
  @IsOptional()
  @IsString()
  communityCursor?: string;

  @ApiPropertyOptional({
    description: '공연소식 섹션 다음 페이지 커서 (직전 응답 news.nextCursor)',
  })
  @IsOptional()
  @IsString()
  newsCursor?: string;

  @ApiPropertyOptional({
    description: '모집공고 섹션 다음 페이지 커서 (직전 응답 announcements.nextCursor)',
  })
  @IsOptional()
  @IsString()
  announcementCursor?: string;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 8;
}
