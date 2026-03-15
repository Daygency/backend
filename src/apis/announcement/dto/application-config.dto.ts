import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * 지원서 양식 입력 DTO
 * 각 항목 포함 여부
 */
export class ApplicationConfigDto {
  @ApiProperty({ description: '이름 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeName?: boolean = false;

  @ApiProperty({ description: '출생연도 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeBirth?: boolean = false;

  @ApiProperty({ description: '성별 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeGender?: boolean = false;

  @ApiProperty({ description: '전공 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeMajor?: boolean = false;

  @ApiProperty({ description: '세부전공 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeMajorDetail?: boolean = false;

  @ApiProperty({ description: '학력(학교/학년) 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeEducation?: boolean = false;

  @ApiProperty({ description: '참가부문 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeCategory?: boolean = false;

  @ApiProperty({ description: '참가곡 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeMusic?: boolean = false;

  @ApiProperty({ description: '상장/트로피 배송 주소 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeAddress?: boolean = false;

  @ApiProperty({ description: '사진/영상/파일 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeFile?: boolean = false;

  @ApiProperty({ description: '링크첨부 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeLink?: boolean = false;

  @ApiProperty({ description: '소속학부 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDepartment?: boolean = false;

  @ApiProperty({ description: '경력 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeCareer?: boolean = false;

  @ApiProperty({ description: '자기소개/지원동기 포함 여부', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeIntroduce?: boolean = false;
}
