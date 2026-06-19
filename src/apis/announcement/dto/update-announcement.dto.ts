import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAnnouncementDto } from './create-announcement.dto';

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {
  @ApiPropertyOptional({
    description:
      '공연·계약 종료 완료 표시(수동). `scheduledAt`이 현재 시각보다 이전이면 자동으로 완료로 간주되며, 그때는 이 필드 없이도 completed가 true입니다.',
  })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
