import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { SocialProvider } from '../user/entities/user.entity';
import type { SocialProfile } from './types/social-profile.type';

interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    profile?: { nickname?: string; profile_image_url?: string };
    email?: string;
  };
  properties?: { nickname?: string; profile_image?: string };
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
    const profile = data.kakao_account?.profile ?? data.properties;
    const profileImg =
      profile && 'profile_image_url' in profile
        ? profile.profile_image_url
        : profile && 'profile_image' in profile
          ? profile.profile_image
          : '';

    return {
      socialId: String(data.id),
      nickname: profile?.nickname ?? '',
      email: data.kakao_account?.email ?? '',
      profileImgUrl: profileImg ?? '',
    };
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
    const user = await this.userService.findOrCreateBySocial(provider, profile);

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
