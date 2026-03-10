import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('kakao')
  async loginWithKakao(@Body() body: { accessToken: string }) {
    return await this.authService.loginWithKakao(body.accessToken);
  }

  @Post('google')
  async loginWithGoogle(@Body() body: { accessToken: string }) {
    return await this.authService.loginWithGoogle(body.accessToken);
  }

  @Post('naver')
  async loginWithNaver(@Body() body: { accessToken: string }) {
    return await this.authService.loginWithNaver(body.accessToken);
  }
}
