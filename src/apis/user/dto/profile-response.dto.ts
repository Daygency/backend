import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class ProfileResponseDto {
  @ApiProperty({ description: '프로필 이미지 URL' })
  profileImgUrl: string;

  @ApiProperty({ description: '닉네임' })
  nickname: string;

  @ApiProperty({ enum: UserRole, description: '역할' })
  role: UserRole;

  @ApiProperty({ description: '소개' })
  aboutMe: string;

  @ApiProperty({ description: '학력', nullable: true })
  education: string | null;

  @ApiProperty({ description: '경력', nullable: true })
  career: string | null;

  @ApiProperty({ description: '수상경력', nullable: true })
  awards: string | null;

  @ApiProperty({ description: '연락처 (이메일, 전화번호)' })
  contact: {
    email: string;
    phoneNumber: string;
  };
}
