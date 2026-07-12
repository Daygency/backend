import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { SocialLoginDto } from './social-login.dto';
import { UserRole } from 'src/apis/user/entities/user.entity';

export class SocialSignupDto extends SocialLoginDto {
  @ApiPropertyOptional({
    description:
      '신규 가입 시 필수(특수문자 불가, 중복 허용). 기존 계정(탈퇴 유예 중) 복구만 할 때는 생략 가능.',
    example: '홍길동',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description:
      '신규 가입 시 필수. 기존 계정(탈퇴 유예 중) 복구만 할 때는 생략 가능.',
    example: 'my_activity_id',
  })
  @IsOptional()
  @IsString()
  activityName?: string;

  @ApiPropertyOptional({
    description: '사용자 역할',
    example: UserRole.USER,
  })
  role?: UserRole;
}
