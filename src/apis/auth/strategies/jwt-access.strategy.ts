import { Inject, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserActivity } from '../../user/entities/user.entity';
import { UserService } from '../../user/services/user.service';

interface IJwtPayload {
  sub: string;
}

export class JwtAccessStrategy extends PassportStrategy(Strategy, 'access') {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') ?? '',
    });
  }

  async validate(payload: IJwtPayload) {
    const user = await this.userService.findOneForAuth(payload.sub);
    if (!user) {
      throw new UnauthorizedException(
        '계정을 찾을 수 없거나 탈퇴한 사용자입니다.',
      );
    }
    if (user.activity === UserActivity.BAN) {
      throw new UnauthorizedException('이용이 제한된 계정입니다.');
    }
    return {
      id: payload.sub,
    };
  }
}
