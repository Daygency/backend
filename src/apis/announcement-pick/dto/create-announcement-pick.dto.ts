import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

export class CreateAnnouncementPickDto {
  @IsString()
  @Length(1, 80)
  organizerName: string;

  @IsString()
  @Length(1, 120)
  title: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  keywords: string[];

  @IsDateString()
  deadlineAt: string;

  @IsUrl()
  @Length(1, 512)
  linkUrl: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
