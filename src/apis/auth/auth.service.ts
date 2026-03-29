import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/services/user.service';
import { SocialProvider, UserRole } from '../user/entities/user.entity';
import type { SocialProfile } from './types/social-profile.type';

interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    profile?: {
      nickname?: string;
      profile_image_url?: string;
      thumbnail_image_url?: string;
    };
    email?: string;
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
}

/** https://openapi.naver.com/v1/nid/me — `response.{ id, email, name, nickname, profile_image }` */
interface NaverUserResponse {
  resultcode: string;
  response?: {
    id: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
  };
}

interface GoogleUserResponse {
  id: string;
  name?: string;
  email?: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithKakao(accessToken: string) {
    const profile = await this.validateKakaoToken(accessToken);
    return this.issueTokens(profile, SocialProvider.KAKAO);
  }

  /**
   * 네이버 인가 code → 토큰 API 교환 → nid/me → JWT 또는 needsSignup.
   * .env: OAUTH_NAVER_CLIENT_ID / OAUTH_NAVER_CLIENT_SECRET 등 (getNaverClientCredentials 참고)
   */
  async loginWithNaverCode(dto: {
    code: string;
    redirectUri: string;
    redirect_uri?: string;
    state?: string;
  }) {
    const redirectUri = this.resolveNaverRedirectUri(dto);
    const naverAccessToken = await this.exchangeNaverAuthorizationCode(
      dto.code.trim(),
      redirectUri,
      dto.state,
    );
    const profile = await this.validateNaverToken(naverAccessToken);
    const user = await this.userService.findBySocial(
      SocialProvider.NAVER,
      profile,
    );

    if (!user) {
      return {
        needsSignup: true,
        profile: {
          socialId: profile.socialId,
          nickname: profile.nickname,
          email: profile.email,
          profileImgUrl: profile.profileImgUrl,
        },
        /** POST /auth/signup/naver 의 accessToken 으로 그대로 전달 */
        naverAccessToken,
        oauthAccessToken: naverAccessToken,
      };
    }

    return this.issueAccessAndRefreshTokens(user);
  }

  async loginWithGoogle(accessToken: string) {
    const profile = await this.validateGoogleToken(accessToken);
    return this.issueTokens(profile, SocialProvider.GOOGLE);
  }

  private async validateKakaoToken(
    accessToken: string,
  ): Promise<SocialProfile> {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new UnauthorizedException('Invalid Kakao access token');
    }

    const data = (await res.json()) as KakaoUserResponse;
    this.logger.log('[Kakao raw]', JSON.stringify(data, null, 2));

    const profile = data.kakao_account?.profile ?? data.properties;
    const profileImg =
      (profile &&
        'profile_image_url' in profile &&
        profile.profile_image_url) ||
      (profile &&
        'thumbnail_image_url' in profile &&
        profile.thumbnail_image_url) ||
      (profile && 'profile_image' in profile && profile.profile_image) ||
      (profile && 'thumbnail_image' in profile && profile.thumbnail_image) ||
      '';

    const socialProfile = {
      socialId: String(data.id),
      nickname: profile?.nickname ?? '',
      email: data.kakao_account?.email ?? '',
      profileImgUrl: profileImg ?? '',
    };
    this.logger.log('[Kakao parsed]', socialProfile);
    return socialProfile;
  }

  private async validateNaverToken(
    accessToken: string,
  ): Promise<SocialProfile> {
    const res = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new UnauthorizedException('Invalid Naver access token');
    }

    const data = (await res.json()) as NaverUserResponse;
    this.logger.log('[Naver raw]', JSON.stringify(data, null, 2));
    if (data.resultcode !== '00' || !data.response) {
      throw new UnauthorizedException('Invalid Naver response');
    }

    const r = data.response;
    const socialProfile = {
      socialId: r.id,
      nickname: (r.nickname ?? r.name ?? '').trim(),
      email: r.email ?? '',
      profileImgUrl: r.profile_image ?? '',
    };
    this.logger.log('[Naver parsed]', socialProfile);
    return socialProfile;
  }

  private resolveNaverRedirectUri(dto: {
    redirectUri: string;
    redirect_uri?: string;
  }): string {
    const primary = dto.redirectUri.trim();
    const alt = dto.redirect_uri?.trim();
    if (alt && alt !== primary) {
      throw new BadRequestException(
        'redirectUri 와 redirect_uri 는 동일한 문자열이어야 합니다.',
      );
    }
    return primary;
  }

  private getNaverClientCredentials(): {
    clientId: string;
    clientSecret: string;
  } {
    const clientId = this.configService
      .get<string>('OAUTH_NAVER_CLIENT_ID')
      ?.trim();
    const clientSecret = this.configService
      .get<string>('OAUTH_NAVER_CLIENT_SECRET')
      ?.trim();
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        '서버 .env 에 네이버 클라이언트 자격 증명을 설정하세요. (예: OAUTH_NAVER_CLIENT_ID, OAUTH_NAVER_CLIENT_SECRET)',
      );
    }
    return { clientId, clientSecret };
  }

  private async exchangeNaverAuthorizationCode(
    code: string,
    redirectUri: string,
    state?: string,
  ): Promise<string> {
    const { clientId, clientSecret } = this.getNaverClientCredentials();

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    if (state != null && state !== '') {
      params.set('state', state);
    }

    const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const raw = await tokenRes.text();
    let tokenJson: {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    try {
      tokenJson = JSON.parse(raw) as typeof tokenJson;
    } catch {
      this.logger.warn('[Naver token] non-JSON', raw.slice(0, 200));
      throw new UnauthorizedException(
        '네이버 토큰 응답 형식이 올바르지 않습니다.',
      );
    }

    if (!tokenRes.ok || !tokenJson.access_token) {
      this.logger.warn(
        '[Naver token exchange]',
        tokenJson.error,
        tokenJson.error_description ?? raw.slice(0, 300),
      );
      throw new UnauthorizedException(
        tokenJson.error_description ??
          tokenJson.error ??
          '네이버 인가 코드로 액세스 토큰을 발급하지 못했습니다. code 재사용·redirect 불일치 여부를 확인하세요.',
      );
    }

    return tokenJson.access_token;
  }

  private async validateGoogleToken(
    accessToken: string,
  ): Promise<SocialProfile> {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`,
    );

    if (!res.ok) {
      throw new UnauthorizedException('Invalid Google access token');
    }

    const data = (await res.json()) as GoogleUserResponse;

    return {
      socialId: data.id,
      nickname: data.name ?? '',
      email: data.email ?? '',
      profileImgUrl: data.picture ?? '',
    };
  }

  private async issueTokens(profile: SocialProfile, provider: SocialProvider) {
    const user = await this.userService.findBySocial(provider, profile);

    if (!user) {
      return {
        needsSignup: true,
        profile: {
          socialId: profile.socialId,
          nickname: profile.nickname,
          email: profile.email,
          profileImgUrl: profile.profileImgUrl,
        },
      };
    }

    return this.issueAccessAndRefreshTokens(user);
  }

  /** access(1h) + refresh(30d) 토큰 쌍 발급 */
  private issueAccessAndRefreshTokens(user: {
    userId: string;
    nickname: string;
    email: string;
    profileImgUrl: string;
  }) {
    const payload = { sub: user.userId };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '1h',
    });
    const refreshToken = this.jwtService.sign(
      { sub: user.userId, type: 'refresh' },
      {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ??
          this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '30d',
      },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        nickname: user.nickname,
        email: user.email,
        profileImgUrl: user.profileImgUrl,
      },
    };
  }

  /** refresh token으로 새 access token 발급 */
  async refreshTokens(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('refresh token이 필요합니다.');
    }
    try {
      const payload = this.jwtService.verify<{ sub: string; type: string }>(
        refreshToken,
        {
          secret:
            this.configService.get<string>('JWT_REFRESH_SECRET') ??
            this.configService.get<string>('JWT_ACCESS_SECRET'),
        },
      );
      if (payload?.type !== 'refresh' || !payload?.sub) {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }
      const user = await this.userService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }
      const { accessToken, user: userInfo } =
        this.issueAccessAndRefreshTokens(user);
      this.logger.log(`[Refresh success] userId=${user.userId}`);
      return { accessToken, user: userInfo };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('refresh token이 만료되었습니다.');
    }
  }

  async signupWithKakao(
    accessToken: string,
    options?: { nickname?: string; activityName?: string; role?: UserRole },
  ) {
    const profile = await this.validateKakaoToken(accessToken);
    return this.signupWithSocial(SocialProvider.KAKAO, profile, options);
  }

  async signupWithNaver(
    accessToken: string,
    options?: { nickname?: string; activityName?: string; role?: UserRole },
  ) {
    const profile = await this.validateNaverToken(accessToken);
    return this.signupWithSocial(SocialProvider.NAVER, profile, options);
  }

  async signupWithGoogle(
    accessToken: string,
    options?: { nickname?: string; activityName?: string; role?: UserRole },
  ) {
    const profile = await this.validateGoogleToken(accessToken);
    return this.signupWithSocial(SocialProvider.GOOGLE, profile, options);
  }

  private async signupWithSocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: {
      nickname?: string;
      activityName?: string;
      role?: UserRole;
    },
  ) {
    const existing = await this.userService.findBySocial(provider, profile);
    if (existing) {
      const result = this.issueAccessAndRefreshTokens(existing);
      this.logger.log(
        `[Signup login existing] provider=${provider}, userId=${existing.userId}`,
      );
      return result;
    }

    if (!options?.activityName?.trim()) {
      throw new BadRequestException('활동아이디(activityName)를 입력해주세요.');
    }

    const user = await this.userService.createBySocial(provider, profile, {
      nickname: options.nickname,
      activityName: options.activityName,
      role: options.role,
    });

    const result = this.issueAccessAndRefreshTokens(user);
    this.logger.log(
      `[Signup success] provider=${provider}, userId=${user.userId}`,
    );
    return result;
  }
}
