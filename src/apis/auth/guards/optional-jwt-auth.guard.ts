import { AuthGuard } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

/**
 * JWT 인증이 선택적인 가드.
 * 토큰이 있으면 검증하고 req.user 설정, 없으면 req.user = undefined로 통과.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('access') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    return user;
  }
}
