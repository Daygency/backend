import { PartialType } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CreateHomeBannerDto } from './create-home-banner.dto';

export class UpdateHomeBannerDto extends PartialType(CreateHomeBannerDto) {
  /** 수정 시 유지할 기존 이미지 URL (순서 유지) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keptImageUrls?: string[];
}
