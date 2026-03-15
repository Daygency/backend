import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: '로그인/회원가입 시 발급받은 refresh token',
    example: 'eyJhbGciOiJIUzI1NiIs...',
  })
  refreshToken: string;
}
