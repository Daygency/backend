import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class SetPushCategoryPreferencesDto {
  @ApiPropertyOptional({ description: '팔로우 알림 수신 여부' })
  @IsOptional()
  @IsBoolean()
  follow?: boolean;

  @ApiPropertyOptional({ description: '지원 알림 수신 여부' })
  @IsOptional()
  @IsBoolean()
  application?: boolean;

  @ApiPropertyOptional({ description: '활동 후기 알림 수신 여부' })
  @IsOptional()
  @IsBoolean()
  review?: boolean;

  @ApiPropertyOptional({ description: '고객센터 문의 답변 알림 수신 여부' })
  @IsOptional()
  @IsBoolean()
  inquiry?: boolean;
}
