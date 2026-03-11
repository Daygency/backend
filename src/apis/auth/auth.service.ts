import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/services/user.service';
import { SocialProvider } from '../user/entities/user.entity';
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

interface NaverUserResponse {
  resultcode: string;
  response?: {
    id: string;
    nickname?: string;
    email?: string;
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

  async loginWithNaver(accessToken: string) {
    const profile = await this.validateNaverToken(accessToken);
    return this.issueTokens(profile, SocialProvider.NAVER);
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
    if (data.resultcode !== '00' || !data.response) {
      throw new UnauthorizedException('Invalid Naver response');
    }

    const r = data.response;
    return {
      socialId: r.id,
      nickname: r.nickname ?? '',
      email: r.email ?? '',
      profileImgUrl: r.profile_image ?? '',
    };
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

    const payload = { sub: user.userId };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '1h',
    });

    return {
      accessToken,
      user: {
        userId: user.userId,
        nickname: user.nickname,
        email: user.email,
        profileImgUrl: user.profileImgUrl,
      },
    };
  }

  async signupWithKakao(
    accessToken: string,
    options?: { nickname?: string; activityName?: string },
  ) {
    const profile = await this.validateKakaoToken(accessToken);
    return this.signupWithSocial(SocialProvider.KAKAO, profile, options);
  }

  async signupWithNaver(
    accessToken: string,
    options?: { nickname?: string; activityName?: string },
  ) {
    const profile = await this.validateNaverToken(accessToken);
    return this.signupWithSocial(SocialProvider.NAVER, profile, options);
  }

  async signupWithGoogle(
    accessToken: string,
    options?: { nickname?: string; activityName?: string },
  ) {
    const profile = await this.validateGoogleToken(accessToken);
    return this.signupWithSocial(SocialProvider.GOOGLE, profile, options);
  }

  private async signupWithSocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: { nickname?: string; activityName?: string },
  ) {
    const existing = await this.userService.findBySocial(provider, profile);
    if (existing) {
      const payload = { sub: existing.userId };
      const accessToken = this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '1h',
      });
      return {
        accessToken,
        user: {
          userId: existing.userId,
          nickname: existing.nickname,
          email: existing.email,
          profileImgUrl: existing.profileImgUrl,
        },
      };
    }

    if (!options?.activityName?.trim()) {
      throw new BadRequestException('활동아이디(activityName)를 입력해주세요.');
    }

    const user = await this.userService.createBySocial(provider, profile, {
      nickname: options.nickname,
      activityName: options.activityName,
    });

    const payload = { sub: user.userId };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '1h',
    });

    return {
      accessToken,
      user: {
        userId: user.userId,
        nickname: user.nickname,
        email: user.email,
        profileImgUrl: user.profileImgUrl,
      },
    };
  }
}
