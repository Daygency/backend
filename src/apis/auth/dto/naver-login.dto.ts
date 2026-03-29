import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class NaverLoginDto {
  @ApiProperty({ description: '네이버 인가 응답의 code (1회용, 재사용 불가)' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'authorize 요청 시 사용한 redirect 와 완전 동일',
    example: '..',
  })
  @IsString()
  @IsNotEmpty()
  redirectUri: string;

  @ApiPropertyOptional({
    description:
      'redirectUri 와 같은 문자열 (중복 필드, 둘 다 오면 반드시 동일)',
  })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional({
    description: '인가 요청에 state 를 썼다면 동일 값',
  })
  @IsOptional()
  @IsString()
  state?: string;
}
