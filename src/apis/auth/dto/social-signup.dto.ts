import { ApiPropertyOptional } from '@nestjs/swagger';
import { SocialLoginDto } from './social-login.dto';
import { UserRole } from 'src/apis/user/entities/user.entity';

export class SocialSignupDto extends SocialLoginDto {
  @ApiPropertyOptional({
    description: '사용자 지정 닉네임 (미입력 시 소셜 프로필 값 사용)',
    example: '내닉네임',
  })
  nickname?: string;

  @ApiPropertyOptional({
    description: '사용자 역할',
    example: UserRole.ARTIST,
  })
  role?: UserRole;
}
