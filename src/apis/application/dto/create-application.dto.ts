import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApplicationGender } from '../entities/application.entity';

/**
 * 지원폼 제출 DTO — application_config에서 true인 항목만 서비스에서 필수 검증
 */
export class CreateApplicationDto {
  @ApiProperty({ description: '모집공고 post_id' })
  @IsUUID()
  postId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  includeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  includeBirth?: string;

  @ApiPropertyOptional({ enum: ApplicationGender })
  @IsOptional()
  @IsEnum(ApplicationGender)
  includeGender?: ApplicationGender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  includeMajor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  includeMajorDetail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  includeEducation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  includeCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  includeMusic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  includeAddress?: string;

  @ApiPropertyOptional({ description: '사진/영상/파일 첨부 여부' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  includeFile?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  includeLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  includeDepartment?: string;

  @ApiPropertyOptional({ description: '경력 관련 플래그' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  includeCareer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  includeIntroduce?: string;
}
