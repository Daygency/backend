import {
  BadRequestException,
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
import { AdminWebLoginDto } from './dto/admin-web-login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('kakao')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '카카오 로그인' })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({ status: 200, description: '카카오 로그인 성공' })
  async loginWithKakao(@Body() body: SocialLoginDto) {
    return await this.authService.loginWithKakao(body);
  }

  @Post('google')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '구글 로그인' })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({ status: 200, description: '구글 로그인 성공' })
  async loginWithGoogle(@Body() body: SocialLoginDto) {
    return await this.authService.loginWithGoogle(body);
  }

  @Post('naver')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({
    summary: '네이버 로그인',
    description:
      '모바일: 네이버 OAuth accessToken(또는 access_token). 웹: code + redirectUri — 서버가 토큰 교환. 미가입 시 naverAccessToken·oauthAccessToken → signup/naver 의 accessToken.',
  })
  @ApiBody({ type: NaverLoginDto })
  @ApiResponse({ status: 200, description: 'JWT 발급 또는 needsSignup' })
  async loginWithNaver(@Body() body: NaverLoginDto) {
    return await this.authService.loginWithNaver(body);
  }

  @Post('signup/kakao')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '카카오 회원가입' })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithKakao(@Body() body: SocialSignupDto) {
    const token = body.accessToken?.trim() || body.access_token?.trim();
    if (!token) {
      throw new BadRequestException(
        'accessToken 또는 access_token이 필요합니다.',
      );
    }
    return await this.authService.signupWithKakao(token, {
      name: body.name,
      activityName: body.activityName,
      role: body.role,
      confirmReactivation: body.confirmReactivation === true,
      declineReactivation: body.declineReactivation === true,
    });
  }

  @Post('signup/google')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '구글 회원가입' })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithGoogle(@Body() body: SocialSignupDto) {
    const token = body.accessToken?.trim() || body.access_token?.trim();
    if (!token) {
      throw new BadRequestException(
        'accessToken 또는 access_token이 필요합니다.',
      );
    }
    return await this.authService.signupWithGoogle(token, {
      name: body.name,
      activityName: body.activityName,
      role: body.role,
      confirmReactivation: body.confirmReactivation === true,
      declineReactivation: body.declineReactivation === true,
    });
  }

  @Post('signup/naver')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({
    summary: '네이버 회원가입',
    description:
      'accessToken 은 로그인 응답의 naverAccessToken(또는 oauthAccessToken). code 를 넣지 말 것.',
  })
  @ApiBody({ type: SocialSignupDto })
  @ApiResponse({ status: 200, description: '회원가입 완료 및 토큰 발급' })
  @ApiResponse({ status: 409, description: '이미 사용 중인 닉네임' })
  async signupWithNaver(@Body() body: SocialSignupDto) {
    const token = body.accessToken?.trim() || body.access_token?.trim();
    if (!token) {
      throw new BadRequestException(
        'accessToken 또는 access_token이 필요합니다.',
      );
    }
    return await this.authService.signupWithNaver(token, {
      name: body.name,
      activityName: body.activityName,
      role: body.role,
      confirmReactivation: body.confirmReactivation === true,
      declineReactivation: body.declineReactivation === true,
    });
  }

  @Post('admin/login')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '관리자 웹 로그인 (ADMIN_WEB_SECRET + admin 계정)' })
  @ApiBody({ type: AdminWebLoginDto })
  async loginAdminWeb(@Body() body: AdminWebLoginDto) {
    return this.authService.loginAdminWeb(body);
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
