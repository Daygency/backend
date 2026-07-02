import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateAnnouncementPickDto } from './create-announcement-pick.dto';

export class UpdateAnnouncementPickDto extends PartialType(
  CreateAnnouncementPickDto,
) {
  @IsOptional()
  @IsString()
  keptImageUrl?: string;
}
