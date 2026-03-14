import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { User, SocialProvider, UserRole } from '../entities/user.entity';
import type { SocialProfile } from '../../auth/types/social-profile.type';
import { ProfileResponseDto } from '../dto/profile-response.dto';
import {
  UpdateAwardDto,
  UpdateCareerDto,
  UpdateEducationDto,
  UpdateUserDto,
} from '../dto/update-user.dto';
import { Education } from '../entities/education.entity';
import { Career } from '../entities/career.entity';
import { Major } from '../entities/major.entity';
import { Award } from '../entities/award.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Education)
    private readonly educationRepository: Repository<Education>,
    @InjectRepository(Career)
    private readonly careerRepository: Repository<Career>,
    @InjectRepository(Major)
    private readonly majorRepository: Repository<Major>,
    @InjectRepository(Award)
    private readonly awardRepository: Repository<Award>,
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
    options: { nickname?: string; activityName: string },
  ): Promise<User> {
    const baseNickname = options.nickname ?? profile.nickname;
    const nickname = await this.resolveNickname(
      baseNickname,
      provider,
      profile.socialId,
    );
    const activityName = options.activityName.trim();
    const email =
      profile.email || `${provider}_${profile.socialId}@social.placeholder`;

    const user = this.userRepository.create({
      nickname,
      activityName,
      aboutMe: '',
      email,
      role: UserRole.USER,
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

  async getMyProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userRepository.findOne({
      where: { userId },
      relations: ['educations', 'careers', 'awards', 'major'], // 이 줄 추가
      select: [
        'userId',
        'profileImgUrl',
        'activityName',
        'nickname',
        'role',
        'aboutMe',
        'selfIntroduction',
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
      activityName: user.activityName,
      role: user.role,
      aboutMe: user.aboutMe,
      selfIntroduction: user.selfIntroduction,
      educations: user.educations ?? null,
      careers: user.careers ?? null,
      awards: user.awards ?? null,
      major: user.major ?? null,
      contact: {
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    };
  }

  async updateMyProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: { userId },
      relations: ['educations', 'careers', 'awards', 'major'],
    });
    if (!user) {
      throw new NotFoundException('프로필을 찾을 수 없습니다.');
    }

    const { educations, careers, awards, majorId, ...scalarFields } =
      updateUserDto;

    Object.assign(user, scalarFields as Partial<User>);

    if (majorId) {
      const major = await this.majorRepository.findOne({
        where: { majorId },
      });
      if (!major) {
        throw new NotFoundException('전공을 찾을 수 없습니다.');
      }
      user.major = major;
    }

    const savedUser = await this.userRepository.save(user);

    if (educations) {
      await this.syncEducations(savedUser, educations);
    }

    if (careers) {
      await this.syncCareers(savedUser, careers);
    }

    if (awards) {
      await this.syncAwards(savedUser, awards);
    }

    return this.getMyProfile(savedUser.userId);
  }

  private async syncEducations(
    user: User,
    educationDtos: UpdateEducationDto[],
  ) {
    const existing: Education[] = user.educations ?? [];
    const existingMap = new Map<string, Education>(
      existing.map((e: Education) => [e.educationId, e]),
    );

    const incomingIds = new Set(
      educationDtos
        .map((e: UpdateEducationDto) => e.educationId)
        .filter((id): id is string => Boolean(id)),
    );

    const toSave: Education[] = [];

    for (const dto of educationDtos) {
      if (dto.educationId && existingMap.has(dto.educationId)) {
        const entity = existingMap.get(dto.educationId) as Education;
        entity.description = dto.description;
        entity.startedAt = new Date(dto.startedAt);
        entity.endedAt = new Date(dto.endedAt);
        toSave.push(entity);
      } else {
        const entity = this.educationRepository.create({
          description: dto.description,
          startedAt: new Date(dto.startedAt),
          endedAt: new Date(dto.endedAt),
          user,
        });
        toSave.push(entity);
      }
    }

    const toDeleteIds = existing
      .filter((e: Education) => !incomingIds.has(e.educationId))
      .map((e: Education) => e.educationId);

    if (toDeleteIds.length) {
      await this.educationRepository.delete({ educationId: In(toDeleteIds) });
    }

    if (toSave.length) {
      await this.educationRepository.save(toSave);
    }
  }

  private async syncCareers(user: User, careerDtos: UpdateCareerDto[]) {
    const existing: Career[] = user.careers ?? [];
    const existingMap = new Map<string, Career>(
      existing.map((c: Career) => [c.careerId, c]),
    );

    const incomingIds = new Set(
      careerDtos
        .map((c: UpdateCareerDto) => c.careerId)
        .filter((id): id is string => Boolean(id)),
    );

    const toSave: Career[] = [];

    for (const dto of careerDtos) {
      if (dto.careerId && existingMap.has(dto.careerId)) {
        const entity = existingMap.get(dto.careerId) as Career;
        entity.description = dto.description;
        entity.startedAt = new Date(dto.startedAt);
        entity.endedAt = new Date(dto.endedAt);
        toSave.push(entity);
      } else {
        const entity = this.careerRepository.create({
          description: dto.description,
          startedAt: new Date(dto.startedAt),
          endedAt: new Date(dto.endedAt),
          user,
        });
        toSave.push(entity);
      }
    }

    const toDeleteIds = existing
      .filter((c: Career) => !incomingIds.has(c.careerId))
      .map((c: Career) => c.careerId);

    if (toDeleteIds.length) {
      await this.careerRepository.delete({ careerId: In(toDeleteIds) });
    }

    if (toSave.length) {
      await this.careerRepository.save(toSave);
    }
  }

  private async syncAwards(user: User, awardDtos: UpdateAwardDto[]) {
    const existing: Award[] = user.awards ?? [];
    const existingMap = new Map<string, Award>(
      existing.map((a: Award) => [a.awardId, a]),
    );

    const incomingIds = new Set(
      awardDtos
        .map((a: UpdateAwardDto) => a.awardId)
        .filter((id): id is string => Boolean(id)),
    );

    const toSave: Award[] = [];

    for (const dto of awardDtos) {
      if (dto.awardId && existingMap.has(dto.awardId)) {
        const entity = existingMap.get(dto.awardId) as Award;
        entity.description = dto.description;
        entity.awardedAt = new Date(dto.awardedAt);
        toSave.push(entity);
      } else {
        const entity = this.awardRepository.create({
          description: dto.description,
          awardedAt: new Date(dto.awardedAt),
          user,
        });
        toSave.push(entity);
      }
    }

    const toDeleteIds = existing
      .filter((a: Award) => !incomingIds.has(a.awardId))
      .map((a: Award) => a.awardId);

    if (toDeleteIds.length) {
      await this.awardRepository.delete({ awardId: In(toDeleteIds) });
    }

    if (toSave.length) {
      await this.awardRepository.save(toSave);
    }
  }

  async findUsersByActivityName(activityName: string) {
    if (!activityName) {
      throw new NotFoundException('활동명을 입력해주세요.');
    }
    const users = await this.userRepository.find({ where: { activityName } });
    if (!users) {
      throw new NotFoundException('활동명을 찾을 수 없습니다.');
    }
    return users.map((user) => ({
      userId: user.userId,
      profileImgUrl: user.profileImgUrl,
      nickname: user.nickname,
      activityName: user.activityName,
    }));
  }

  /**
   * TODO: 내부적인 추천 로직은 나중에 같이 이야기해보자.
   * 현재는 랜덤으로 반환.
   */
  async getRecommendedUsers(limit = 20) {
    const users = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.userId',
        'user.profileImgUrl',
        'user.nickname',
        'user.activityName',
      ])
      .orderBy('RAND()')
      .take(limit)
      .getMany();

    return users.map((user) => ({
      userId: user.userId,
      profileImgUrl: user.profileImgUrl,
      nickname: user.nickname,
      activityName: user.activityName,
    }));
  }
}
