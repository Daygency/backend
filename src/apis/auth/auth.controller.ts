import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SocialLoginDto } from './dto/social-login.dto';
import { SocialSignupDto } from './dto/social-signup.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('kakao')
  @ApiOperation({ summary: '카카오 로그인' })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({ status: 200, description: '카카오 로그인 성공' })
  async loginWithKakao(@Body() body: SocialLoginDto) {
    console.log('#');
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

  @Post('signup/kakao')
  @ApiOperation({ summary: '카카오 회원가입' })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithKakao(@Body() body: SocialSignupDto) {
    return await this.authService.signupWithKakao(body.accessToken, {
      nickname: body.nickname,
      activityName: body.activityName,
    });
  }

  @Post('signup/google')
  @ApiOperation({ summary: '구글 회원가입' })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithGoogle(@Body() body: SocialSignupDto) {
    return await this.authService.signupWithGoogle(body.accessToken, {
      nickname: body.nickname,
      activityName: body.activityName,
    });
  }

  @Post('signup/naver')
  @ApiOperation({ summary: '네이버 회원가입' })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithNaver(@Body() body: SocialSignupDto) {
    return await this.authService.signupWithNaver(body.accessToken, {
      nickname: body.nickname,
      activityName: body.activityName,
    });
  }
}
