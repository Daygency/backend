import { Injectable } from '@nestjs/common';
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

  async findOrCreateBySocial(
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { socialProvider: provider, socialId: profile.socialId },
    });
    if (existing) {
      if (
        profile.profileImgUrl &&
        profile.profileImgUrl !== existing.profileImgUrl
      ) {
        existing.profileImgUrl = profile.profileImgUrl;
        return this.userRepository.save(existing);
      }
      return existing;
    }

    const nickname = this.ensureUniqueNickname(
      profile.nickname,
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

  private ensureUniqueNickname(
    base: string,
    provider: string,
    socialId: string,
  ): string {
    const fallback = `u_${provider}_${socialId}`.slice(0, 20);
    if (!base) return fallback;
    const sanitized = base.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 11);
    return `${sanitized}_${socialId.slice(-6)}`.slice(0, 20); // unique per socialId
  }

  create(createUserDto: CreateUserDto) {
    return this.userRepository.save(createUserDto);
  }

  findOne(userId: string) {
    return this.userRepository.findOne({ where: { userId } });
  }
}
