import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SocialLoginDto } from './dto/social-login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('kakao')
  @ApiOperation({ summary: '카카오 로그인' })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({ status: 200, description: '카카오 로그인 성공' })
  async loginWithKakao(@Body() body: SocialLoginDto) {
    return await this.authService.loginWithKakao(body.accessToken);
  }

  @Post('google')
  @ApiOperation({ summary: '구글 로그인' })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({ status: 200, description: '구글 로그인 성공' })
  async loginWithGoogle(@Body() body: SocialLoginDto) {
    return await this.authService.loginWithGoogle(body.accessToken);
  }

  @Post('naver')
  @ApiOperation({ summary: '네이버 로그인' })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({ status: 200, description: '네이버 로그인 성공' })
  async loginWithNaver(@Body() body: SocialLoginDto) {
    return await this.authService.loginWithNaver(body.accessToken);
  }
}
