import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';
import { Education } from '../entities/education.entity';
import { Career } from '../entities/career.entity';
import { Award } from '../entities/award.entity';
import { Major } from '../../major/entities/major.entity';

export class ProfileResponseDto {
  @ApiProperty({
    description: '유저 ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId: string;

  @ApiProperty({ description: '프로필 이미지 URL' })
  profileImgUrl: string;

  @ApiProperty({ description: '닉네임' })
  nickname: string;

  @ApiProperty({ description: '활동명' })
  activityName: string;

  @ApiProperty({ enum: UserRole, description: '역할' })
  role: UserRole;

  @ApiProperty({ description: '소개' })
  aboutMe: string;

  @ApiProperty({ description: '자기소개' })
  selfIntroduction: string;

  @ApiProperty({ description: '학력', type: [Education] })
  educations: Education[];

  @ApiProperty({ description: '경력', type: [Career] })
  careers: Career[];

  @ApiProperty({ description: '수상경력', type: [Award] })
  awards: Award[];

  @ApiProperty({ description: '전공', type: Major })
  major: Major;

  @ApiProperty({ description: '연락처 (이메일, 전화번호)' })
  contact: {
    email: string;
    phoneNumber: string;
  };

  @ApiProperty({ description: '팔로잉 수 (내가 팔로우한 사람 수)' })
  followingCount: number;

  @ApiProperty({ description: '팔로워 수 (나를 팔로우한 사람 수)' })
  followerCount: number;
}
