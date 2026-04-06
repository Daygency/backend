import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApplicationGender } from '../entities/application.entity';

/**
 * 지원폼 제출 DTO — application_config에서 true인 항목만 서비스에서 필수 검증
 * file / education / career 는 스냅샷 JSON(객체·배열 등 자유 형식)
 */
export class CreateApplicationDto {
  @ApiProperty({ description: '모집공고 post_id' })
  @IsUUID()
  postId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  birth?: string;

  @ApiPropertyOptional({ enum: ApplicationGender })
  @IsOptional()
  @IsEnum(ApplicationGender)
  gender?: ApplicationGender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  major?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  majorDetail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  music?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    description: '사진/영상/파일 첨부 스냅샷 (JSON)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @Allow()
  file?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  introduce?: string;

  @ApiPropertyOptional({
    description: '학력(학교/학년 등) 스냅샷 (JSON)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @Allow()
  education?: unknown;

  @ApiPropertyOptional({
    description: '경력 스냅샷 (JSON)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @Allow()
  career?: unknown;
}
