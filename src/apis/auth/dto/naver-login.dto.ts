import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * 두 가지 중 하나:
 * - **네이티브 SDK:** `accessToken` 또는 `access_token` (네이버 OAuth 액세스 토큰)
 * - **웹 인가 code:** `code` + `redirectUri`(또는 `redirect_uri`)
 */
export class NaverLoginDto {
  @ApiPropertyOptional({
    description:
      '@react-native-seoul/naver-login 등 — 네이버에서 받은 OAuth accessToken',
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
    description: '웹 전용 — 네이버 인가 응답의 code (1회용, 재사용 불가)',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: '웹 전용 — authorize 요청 시 사용한 redirect 와 완전 동일',
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiPropertyOptional({
    description:
      'redirectUri 와 같은 문자열 (중복 필드, 둘 다 오면 반드시 동일)',
  })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional({
    description: '인가 요청에 state 를 썼다면 동일 값 (code 플로우)',
  })
  @IsOptional()
  @IsString()
  state?: string;
}
