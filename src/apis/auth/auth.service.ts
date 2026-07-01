import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/services/user.service';
import {
  SocialProvider,
  User,
  UserActivity,
  UserRole,
} from '../user/entities/user.entity';
import type { SocialProfile } from './types/social-profile.type';
import type { NeedsReactivationLoginResponse } from './types/needs-reactivation-login.type';
import {
  computeReactivationDeadline,
  isWithinReactivationGrace,
} from './utils/reactivation-grace';

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

  async loginAdminWeb(dto: { secret: string; email?: string }) {
    const expected = this.configService.get<string>('ADMIN_WEB_SECRET');
    if (!expected?.trim()) {
      throw new UnauthorizedException(
        'ADMIN_WEB_SECRET 환경변수가 설정되지 않았습니다.',
      );
    }
    if (dto.secret.trim() !== expected.trim()) {
      throw new UnauthorizedException('관리자 인증 키가 올바르지 않습니다.');
    }

    const user = await this.userService.findAdminForWebLogin(dto.email);
    if (!user) {
      throw new UnauthorizedException(
        'role=admin 인 계정을 찾을 수 없습니다.',
      );
    }
    if (user.activity === UserActivity.BAN) {
      throw new ForbiddenException('이용이 제한된 계정입니다.');
    }

    return this.issueAccessAndRefreshTokens(user);
  }

  async loginWithKakao(dto: {
    accessToken?: string;
    access_token?: string;
    confirmReactivation?: boolean;
    declineReactivation?: boolean;
  }) {
    const token = dto.accessToken?.trim() || dto.access_token?.trim();
    if (!token) {
      throw new BadRequestException(
        'accessToken 또는 access_token이 필요합니다.',
      );
    }
    const profile = await this.validateKakaoToken(token);
    return this.issueTokens(profile, SocialProvider.KAKAO, {
      confirmReactivation: dto.confirmReactivation === true,
      declineReactivation: dto.declineReactivation === true,
    });
  }

  /**
   * `POST /auth/naver` — 네이티브는 accessToken, 웹은 code+redirectUri 중 하나.
   */
  async loginWithNaver(dto: {
    accessToken?: string;
    access_token?: string;
    code?: string;
    redirectUri?: string;
    redirect_uri?: string;
    state?: string;
    confirmReactivation?: boolean;
    declineReactivation?: boolean;
  }) {
    const reactivationOptions = this.parseReactivationOptions(dto);
    const token =
      dto.accessToken?.trim() || dto.access_token?.trim() || undefined;
    if (token) {
      return this.loginWithNaverAccessToken(token, reactivationOptions);
    }

    const code = dto.code?.trim();
    const redirectForCode =
      dto.redirectUri?.trim() || dto.redirect_uri?.trim() || undefined;
    if (code && redirectForCode) {
      return this.loginWithNaverCode({
        code,
        redirectUri: redirectForCode,
        redirect_uri: dto.redirect_uri,
        state: dto.state,
        ...reactivationOptions,
      });
    }

    throw new BadRequestException(
      '네이버 로그인: accessToken(또는 access_token) 또는 code+redirectUri(또는 redirect_uri)가 필요합니다.',
    );
  }

  /**
   * 네이버 OAuth accessToken → nid/me → JWT 또는 needsSignup (카카오/구글과 동일 계약).
   */
  async loginWithNaverAccessToken(
    naverAccessToken: string,
    options?: {
      confirmReactivation?: boolean;
      declineReactivation?: boolean;
    },
  ) {
    const profile = await this.validateNaverToken(naverAccessToken);
    const result = await this.issueTokens(
      profile,
      SocialProvider.NAVER,
      options,
    );

    if (
      result &&
      typeof result === 'object' &&
      'needsSignup' in result &&
      result.needsSignup
    ) {
      return {
        ...result,
        naverAccessToken,
        oauthAccessToken: naverAccessToken,
      };
    }

    return result;
  }

  /**
   * 네이버 인가 code → 토큰 API 교환 → nid/me.
   * .env: OAUTH_NAVER_CLIENT_ID / OAUTH_NAVER_CLIENT_SECRET (getNaverClientCredentials)
   */
  async loginWithNaverCode(dto: {
    code: string;
    redirectUri: string;
    redirect_uri?: string;
    state?: string;
    confirmReactivation?: boolean;
    declineReactivation?: boolean;
  }) {
    const redirectUri = this.resolveNaverRedirectUri(dto);
    const naverAccessToken = await this.exchangeNaverAuthorizationCode(
      dto.code.trim(),
      redirectUri,
      dto.state,
    );
    return this.loginWithNaverAccessToken(
      naverAccessToken,
      this.parseReactivationOptions(dto),
    );
  }

  async loginWithGoogle(dto: {
    accessToken?: string;
    access_token?: string;
    confirmReactivation?: boolean;
    declineReactivation?: boolean;
  }) {
    const token = dto.accessToken?.trim() || dto.access_token?.trim();
    if (!token) {
      throw new BadRequestException(
        'accessToken 또는 access_token이 필요합니다.',
      );
    }
    const profile = await this.validateGoogleToken(token);
    return this.issueTokens(profile, SocialProvider.GOOGLE, {
      confirmReactivation: dto.confirmReactivation === true,
      declineReactivation: dto.declineReactivation === true,
    });
  }

  private parseReactivationOptions(dto: {
    confirmReactivation?: boolean;
    declineReactivation?: boolean;
  }) {
    const confirmReactivation = dto.confirmReactivation === true;
    const declineReactivation = dto.declineReactivation === true;
    if (confirmReactivation && declineReactivation) {
      throw new BadRequestException(
        'confirmReactivation과 declineReactivation은 동시에 보낼 수 없습니다.',
      );
    }
    return { confirmReactivation, declineReactivation };
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
      name: profile?.nickname ?? '',
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
      name: (r.nickname ?? r.name ?? '').trim(),
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
      name: data.name ?? '',
      email: data.email ?? '',
      profileImgUrl: data.picture ?? '',
    };
  }

  /** 소셜 provider+id 조회 후, 이메일 없을 때 placeholder 이메일 row까지 조회 */
  private async loadSocialUser(
    profile: SocialProfile,
    provider: SocialProvider,
  ) {
    let user = await this.userService.findBySocial(provider, profile, {
      withDeleted: true,
    });
    if (!user) {
      user = await this.userService.findBySocialPlaceholderEmail(
        provider,
        profile,
        { withDeleted: true },
      );
    }
    return user;
  }

  private buildNeedsReactivationResponse(
    user: User,
    profile: SocialProfile,
  ): NeedsReactivationLoginResponse {
    const deletedAt = user.deletedAt;
    if (!deletedAt) {
      throw new UnauthorizedException('탈퇴 처리된 계정 정보가 없습니다.');
    }
    return {
      needsReactivation: true,
      deletedAt: deletedAt.toISOString(),
      reactivationDeadline:
        computeReactivationDeadline(deletedAt).toISOString(),
      profile: {
        socialId: profile.socialId,
        name: profile.name,
        email: profile.email,
        profileImgUrl: profile.profileImgUrl,
      },
      user: {
        userId: user.userId,
        name: user.name,
        activityName: user.activityName,
        profileImgUrl: user.profileImgUrl,
      },
    };
  }

  private async issueTokens(
    profile: SocialProfile,
    provider: SocialProvider,
    options?: {
      confirmReactivation?: boolean;
      declineReactivation?: boolean;
    },
  ) {
    let user = await this.loadSocialUser(profile, provider);

    if (user?.deletedAt) {
      if (!isWithinReactivationGrace(user.deletedAt)) {
        throw new ForbiddenException(
          '계정 복구 유예 기간이 지났습니다. 다시 가입해 주세요.',
        );
      }
      if (options?.declineReactivation) {
        await this.userService.hardDeleteSoftDeletedUser(user.userId);
        user = null;
      } else if (!options?.confirmReactivation) {
        return this.buildNeedsReactivationResponse(user, profile);
      } else {
        await this.userService.reactivateUser(user.userId);
        user = await this.loadSocialUser(profile, provider);
      }
    }

    if (!user) {
      const email = profile.email?.trim();
      if (email) {
        const existingByEmail = await this.userService.findByEmail(email, {
          withDeleted: true,
        });
        if (
          existingByEmail &&
          existingByEmail.socialProvider !== provider
        ) {
          throw new ConflictException(
            '이미 다른 소셜 계정으로 가입된 이메일입니다.',
          );
        }
      }
      return {
        needsSignup: true,
        profile: {
          socialId: profile.socialId,
          name: profile.name,
          email: profile.email,
          profileImgUrl: profile.profileImgUrl,
        },
      };
    }

    const activeUser = await this.userService.findOneForAuth(user.userId);
    if (!activeUser) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }
    if (activeUser.activity === UserActivity.BAN) {
      throw new ForbiddenException(
        '신고 누적으로 이용이 제한된 계정입니다. 정지 기간이 끝난 뒤 다시 로그인해 주세요.',
      );
    }

    return this.issueAccessAndRefreshTokens(activeUser);
  }

  /** access(1h) + refresh(30d) 토큰 쌍 발급 */
  private issueAccessAndRefreshTokens(user: {
    userId: string;
    name: string | null;
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
        name: user.name,
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
      const user = await this.userService.findOneForAuth(payload.sub);
      if (!user) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }
      if (user.activity === UserActivity.BAN) {
        throw new UnauthorizedException('이용이 제한된 계정입니다.');
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
    options?: {
      name?: string;
      activityName?: string;
      role?: UserRole;
      confirmReactivation?: boolean;
      declineReactivation?: boolean;
    },
  ) {
    const profile = await this.validateKakaoToken(accessToken);
    return this.signupWithSocial(SocialProvider.KAKAO, profile, options);
  }

  async signupWithNaver(
    accessToken: string,
    options?: {
      name?: string;
      activityName?: string;
      role?: UserRole;
      confirmReactivation?: boolean;
      declineReactivation?: boolean;
    },
  ) {
    const profile = await this.validateNaverToken(accessToken);
    return this.signupWithSocial(SocialProvider.NAVER, profile, options);
  }

  async signupWithGoogle(
    accessToken: string,
    options?: {
      name?: string;
      activityName?: string;
      role?: UserRole;
      confirmReactivation?: boolean;
      declineReactivation?: boolean;
    },
  ) {
    const profile = await this.validateGoogleToken(accessToken);
    return this.signupWithSocial(SocialProvider.GOOGLE, profile, options);
  }

  private async signupWithSocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: {
      name?: string;
      activityName?: string;
      role?: UserRole;
      confirmReactivation?: boolean;
      declineReactivation?: boolean;
    },
  ) {
    let existing = await this.loadSocialUser(profile, provider);
    if (existing) {
      if (existing.deletedAt) {
        if (!isWithinReactivationGrace(existing.deletedAt)) {
          throw new ForbiddenException(
            '계정 복구 유예 기간이 지났습니다. 다시 가입해 주세요.',
          );
        }
        if (options?.declineReactivation) {
          await this.userService.hardDeleteSoftDeletedUser(existing.userId);
          existing = null;
        } else if (!options?.confirmReactivation) {
          return this.buildNeedsReactivationResponse(existing, profile);
        } else {
          await this.userService.reactivateUser(existing.userId);
          existing = await this.loadSocialUser(profile, provider);
        }
      }
      if (existing) {
        const result = this.issueAccessAndRefreshTokens(existing);
        this.logger.log(
          `[Signup login existing] provider=${provider}, userId=${existing.userId}`,
        );
        return result;
      }
    }

    if (!options?.activityName?.trim()) {
      throw new BadRequestException('활동아이디(activityName)를 입력해주세요.');
    }

    const user = await this.userService.createBySocial(provider, profile, {
      name: options.name,
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
