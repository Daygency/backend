import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SocialLoginDto {
  @ApiPropertyOptional({
    description: '소셜 OAuth 액세스 토큰. `access_token` 과 둘 중 하나 필수.',
    example: 'kakao_access_token_here',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'accessToken 과 동일 (snake_case 별칭)',
  })
  @IsOptional()
  @IsString()
  access_token?: string;

  @ApiPropertyOptional({
    description:
      '탈퇴 계정 복구 확정 시 true. 유예 기간 내 소프트 삭제 계정의 2차 로그인.',
  })
  @IsOptional()
  @IsBoolean()
  confirmReactivation?: boolean;
}
