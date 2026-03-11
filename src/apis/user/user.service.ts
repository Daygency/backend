import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { User, SocialProvider, UserRole } from './entities/user.entity';
import type { SocialProfile } from '../auth/types/social-profile.type';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findBySocial(
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { socialProvider: provider, socialId: profile.socialId },
    });
    if (!user) return null;
    if (profile.profileImgUrl && profile.profileImgUrl !== user.profileImgUrl) {
      user.profileImgUrl = profile.profileImgUrl;
      await this.userRepository.save(user);
    }
    return user;
  }

  async createBySocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: { nickname?: string },
  ): Promise<User> {
    const baseNickname = options?.nickname ?? profile.nickname;
    const nickname = await this.resolveNickname(
      baseNickname,
      provider,
      profile.socialId,
    );
    const email =
      profile.email || `${provider}_${profile.socialId}@social.placeholder`;

    const user = this.userRepository.create({
      nickname,
      aboutMe: '',
      email,
      role: UserRole.ARTIST,
      phoneNumber: '0000000000000',
      isEmailSubscribed: false,
      isPushEnabled: false,
      artTempo: 0,
      profileImgUrl: profile.profileImgUrl || '',
      socialId: profile.socialId,
      socialProvider: provider,
    });

    return this.userRepository.save(user);
  }

  private async resolveNickname(
    base: string,
    provider: string,
    socialId: string,
  ): Promise<string> {
    const fallback = `u_${provider}_${socialId}`.slice(0, 20);
    if (!base?.trim()) return fallback;

    const sanitized = base.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 20);

    const existing = await this.userRepository.findOne({
      where: { nickname: sanitized },
    });
    if (existing) {
      throw new ConflictException(
        '이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해 주세요.',
      );
    }
    return sanitized;
  }

  create(createUserDto: CreateUserDto) {
    return this.userRepository.save(createUserDto);
  }

  findOne(userId: string) {
    return this.userRepository.findOne({ where: { userId } });
  }

  async getMyProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { userId },
      select: [
        'userId',
        'profileImgUrl',
        'nickname',
        'role',
        'aboutMe',
        'education',
        'career',
        'awards',
        'email',
        'phoneNumber',
      ],
    });
    if (!user) {
      throw new NotFoundException('프로필을 찾을 수 없습니다.');
    }

    return {
      profileImgUrl: user.profileImgUrl,
      nickname: user.nickname,
      role: user.role,
      aboutMe: user.aboutMe,
      education: user.education ?? null,
      career: user.career ?? null,
      awards: user.awards ?? null,
      contact: {
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      followerCount: 0, // 보류
      followingCount: 0, // 보류
    };
  }
}
