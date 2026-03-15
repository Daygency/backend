import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDefined,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AnnouncementStatus } from '../entities/announcement.entity';
import { ApplicationConfigDto } from './application-config.dto';

export class CreateAnnouncementDto {
  @ApiProperty({ description: '제목' })
  @IsString()
  title: string;

  @ApiProperty({ description: '내용' })
  @IsString()
  content: string;

  @ApiProperty({
    description: '마감일 (ISO 8601)',
    example: '2025-04-01T23:59:59.000Z',
  })
  @IsDateString()
  deadlineAt: string;

  @ApiProperty({
    description: '예정일 (ISO 8601)',
    example: '2025-04-15T14:00:00.000Z',
  })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({
    description: '모집 상태',
    enum: AnnouncementStatus,
    default: AnnouncementStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus = AnnouncementStatus.OPEN;

  @ApiProperty({ description: '공연위치' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ description: '대표 파일 ID (썸네일)', nullable: true })
  @IsOptional()
  @IsUUID()
  fileId?: string | null;

  @ApiProperty({
    description: '공고 유형 ID (announcement_category.category_id)',
  })
  @IsUUID()
  categoryId: string;
  @ApiPropertyOptional({
    description: '모집 전공 ID 배열',
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  majorIds?: string[];

  @ApiProperty({ description: '지원서 양식 설정' })
  @IsDefined()
  @ValidateNested()
  @Type(() => ApplicationConfigDto)
  applicationConfig: ApplicationConfigDto;
}
