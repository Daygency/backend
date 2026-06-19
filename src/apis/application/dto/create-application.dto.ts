import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApplicationGender } from '../entities/application.entity';
import type {
  ApplicationAwardSnapshotItem,
  ApplicationCareerSnapshotItem,
  ApplicationCertificateSnapshotItem,
  ApplicationEducationSnapshotItem,
  ApplicationFileSnapshotItem,
} from '../types/application-snapshot.types';

/**
 * 지원폼 제출 DTO — application_config에서 true인 항목만 서비스에서 필수 검증
 * file / education / career / award / certificate 는 스냅샷 JSON 배열 (항목 타입은 types 참고)
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

  @ApiPropertyOptional({
    description: '생년월일(또는 출생 시각) — ISO 8601 문자열',
    example: '1999-03-15',
  })
  @IsOptional()
  @IsDateString()
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
    description: '첨부 파일 스냅샷 (ApplicationFileSnapshotItem[])',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  file?: ApplicationFileSnapshotItem[];

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
    description: '학력 스냅샷 (ApplicationEducationSnapshotItem[])',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  education?: ApplicationEducationSnapshotItem[];

  @ApiPropertyOptional({
    description: '경력 스냅샷 (ApplicationCareerSnapshotItem[])',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  career?: ApplicationCareerSnapshotItem[];

  @ApiPropertyOptional({
    description: '수상 스냅샷 (ApplicationAwardSnapshotItem[])',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  award?: ApplicationAwardSnapshotItem[];

  @ApiPropertyOptional({
    description: '수료증·자격증 스냅샷 (ApplicationCertificateSnapshotItem[])',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  certificate?: ApplicationCertificateSnapshotItem[];
}
