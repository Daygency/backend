import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { ReportCategory, ReportTargetType } from '../entities/report.entity';

export class CreateReportDto {
  @ApiProperty({ description: '신고 대상 사용자 ID' })
  @IsUUID('4')
  reportedUserId: string;

  @ApiProperty({ enum: ReportCategory, description: '신고 카테고리' })
  @IsEnum(ReportCategory)
  category: ReportCategory;

  @ApiProperty({
    enum: ReportTargetType,
    description:
      'COMMUNITY=커뮤니티글 communityId, NEWS=공연소식 newsId, COMMENT=댓글 id, ANNOUNCEMENT=공고 postId',
  })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({
    description:
      '대상 ID — targetType에 따라 communityId / newsId / comment id / announcement postId',
  })
  @IsUUID('4')
  targetId: string;
}
