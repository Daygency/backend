import { ApiProperty } from '@nestjs/swagger';
import { ReportCategory } from '../entities/report.entity';

export class ReportCategoryItemDto {
  @ApiProperty({ enum: ReportCategory, description: '`POST /reports` body의 `category`에 넣는 값' })
  value: ReportCategory;

  @ApiProperty({ description: '한글 표시용 라벨' })
  labelKo: string;
}

export class ReportCategoriesResponseDto {
  @ApiProperty({ type: [ReportCategoryItemDto] })
  categories: ReportCategoryItemDto[];
}
