import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NaverLoginDto } from './dto/naver-login.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { SocialSignupDto } from './dto/social-signup.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({
    summary: '네이버 로그인 (인가 code)',
    description:
      'code + redirectUri 로 서버가 네이버 토큰 교환 후 처리. 미가입 시 naverAccessToken·oauthAccessToken 포함 → signup/naver 의 accessToken 으로 사용.',
  })
  @ApiBody({ type: NaverLoginDto })
  @ApiResponse({ status: 200, description: 'JWT 발급 또는 needsSignup' })
  async loginWithNaver(@Body() body: NaverLoginDto) {
    return await this.authService.loginWithNaverCode(body);
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
      role: body.role,
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
      role: body.role,
    });
  }

  @Post('signup/naver')
  @ApiOperation({
    summary: '네이버 회원가입',
    description:
      'accessToken 은 로그인 응답의 naverAccessToken(또는 oauthAccessToken). code 를 넣지 말 것.',
  })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithNaver(@Body() body: SocialSignupDto) {
    return await this.authService.signupWithNaver(body.accessToken, {
      nickname: body.nickname,
      activityName: body.activityName,
      role: body.role,
    });
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Access Token 갱신' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: '새 access token 발급' })
  @ApiResponse({ status: 401, description: 'refresh token 만료 또는 무효' })
  async refresh(@Body() body: RefreshTokenDto) {
    return await this.authService.refreshTokens(body.refreshToken);
  }
}
