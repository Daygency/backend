import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';
import { Education } from '../entities/education.entity';
import { Career } from '../entities/career.entity';
import { Award } from '../entities/award.entity';
import { Major } from '../../major/entities/major.entity';
import { Certificate } from '../entities/certificate.entity';

/** 타인 프로필 조회 — `ProfileResponseDto`와 동일하나 연락처 없음 */
export class PublicProfileResponseDto {
  @ApiProperty({
    description: '유저 ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId: string;

  @ApiProperty({ description: '프로필 이미지 URL' })
  profileImgUrl: string;

  @ApiProperty({ description: '포트폴리오 배경 이미지 URL' })
  coverImgUrl: string;

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
  educations: Education[] | null;

  @ApiProperty({ description: '경력', type: [Career] })
  careers: Career[] | null;

  @ApiProperty({ description: '수상경력', type: [Award] })
  awards: Award[] | null;

  @ApiProperty({ description: '자격증', type: [Certificate] })
  certificates: Certificate[] | null;

  @ApiProperty({ description: '전공', type: Major })
  major: Major | null;

  @ApiProperty({ description: '팔로잉 수 (해당 유저가 팔로우한 사람 수)' })
  followingCount: number;

  @ApiProperty({ description: '팔로워 수 (해당 유저를 팔로우한 사람 수)' })
  followerCount: number;
}
