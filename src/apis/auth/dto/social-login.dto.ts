import { ApiProperty } from '@nestjs/swagger';

export class SocialLoginDto {
  @ApiProperty({
    description: '소셜 로그인 액세스 토큰',
    example: 'kakao_access_token_here',
  })
  accessToken: string;
}
