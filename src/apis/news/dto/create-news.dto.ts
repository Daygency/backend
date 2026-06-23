import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { OptionalLocationFieldsDto } from '../../../common/dto/optional-location-fields.dto';

export class CreateNewsDto extends OptionalLocationFieldsDto {
  @ApiProperty({ description: '제목', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: '내용', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  content: string;

  @ApiProperty({ description: '장소', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  place: string;

  @ApiPropertyOptional({ description: '티켓 가격', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  ticketPrice?: number | null;

  @ApiProperty({
    description: '공연 시작일시 (ISO 8601)',
    example: '2025-04-01T19:00:00.000Z',
  })
  @IsDateString()
  startedAt: string;

  @ApiPropertyOptional({
    description: '공연 종료일 (하루 공연이면 null)',
    example: '2025-04-02T21:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @ApiProperty({ description: '문의처', maxLength: 30 })
  @IsString()
  @MaxLength(30)
  contact: string;

  @ApiPropertyOptional({
    description: '대표 파일 ID (썸네일). 없으면 프론트에서 default 이미지 사용',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  fileId?: string | null;
}
