import type { Express } from 'express';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { User, SocialProvider, UserRole, UserActivity } from '../entities/user.entity';
import { liftExpiredReportBanIfNeeded } from '../../report/utils/report-ban.util';
import type { SocialProfile } from '../../auth/types/social-profile.type';
import { ProfileResponseDto } from '../dto/profile-response.dto';
import { PublicProfileResponseDto } from '../dto/public-profile-response.dto';
import {
  UpdateAwardDto,
  UpdateCareerDto,
  UpdateCertificateDto,
  UpdateEducationDto,
  UpdateUserDto,
} from '../dto/update-user.dto';
import { Education } from '../entities/education.entity';
import { Career } from '../entities/career.entity';
import { Major } from '../../major/entities/major.entity';
import { Award } from '../entities/award.entity';
import { Certificate } from '../entities/certificate.entity';
import { News } from '../../news/entities/news.entity';
import { Community } from '../../community/entities/community.entity';
import { Announcement } from '../../announcement/entities/announcement.entity';
import { Like, LikeType } from '../../like/entities/like.entity';
import {
  Comment,
  CommentTargetType,
} from '../../comment/entities/comment.entity';
import { Scrap, ScrapTargetType } from '../../scrap/entities/scrap.entity';
import { ListMyScrapQueryDto } from '../dto/list-my-scrap-query.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { toLikePattern } from '../../../common/escape-like-pattern.util';
import { Follow } from '../../follow/entities/follow.entity';
import { FileService } from '../../file/file.service';
import { FileTargetType } from '../../file/entities/file.entity';
import { UserPushDevice } from '../../notice/entities/user-push-device.entity';
import { hardDeleteUserCascade } from '../utils/user-hard-delete-cascade';
import type { PurgeExpiredSoftDeletedUsersResult } from '../types/purge-soft-deleted.types';
import { ListBannedUsersQueryDto } from '../dto/list-banned-users-query.dto';
import { ListMyWrittenPostsQueryDto } from '../dto/list-my-written-posts-query.dto';
import { decodeCursor, encodeCursor } from '../../../common/cursor.util';

function decodeBannedUserCursor(
  cursor: string,
): { n: boolean; b: string | null; t: string; u: string } {
  try {
    const parsed = decodeCursor(cursor) as {
      n?: unknown;
      b?: unknown;
      t?: unknown;
      u?: unknown;
    };
    if (
      typeof parsed.n !== 'boolean' ||
      (parsed.b !== null && typeof parsed.b !== 'string') ||
      typeof parsed.t !== 'string' ||
      typeof parsed.u !== 'string'
    ) {
      throw new Error('invalid cursor shape');
    }
    return { n: parsed.n, b: parsed.b, t: parsed.t, u: parsed.u };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

function decodeMyPostsCursor(cursor: string): { t: string; i: string } {
  try {
    const parsed = decodeCursor(cursor) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') {
      throw new Error('invalid cursor shape');
    }
    return { t: parsed.t, i: parsed.i };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

function encodeMyPostsCursor(createdAt: Date, id: string): string {
  return encodeCursor({ t: createdAt.toISOString(), i: id });
}

function decodeMyAnnouncementPostsCursor(cursor: string): { i: string } {
  try {
    const parsed = decodeCursor(cursor) as { i?: unknown };
    if (typeof parsed.i !== 'string') {
      throw new Error('invalid cursor shape');
    }
    return { i: parsed.i };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

function encodeMyAnnouncementPostsCursor(postId: string): string {
  return encodeCursor({ i: postId });
}

function encodeBannedUserCursor(
  reportBannedUntil: Date | null,
  createdAt: Date,
  userId: string,
): string {
  return encodeCursor({
    n: reportBannedUntil === null,
    b: reportBannedUntil ? reportBannedUntil.toISOString() : null,
    t: createdAt.toISOString(),
    u: userId,
  });
}

function encodeUserListCursor(createdAt: Date, userId: string): string {
  return encodeCursor({ ca: createdAt.toISOString(), uid: userId });
}

function decodeUserListCursor(cursor: string): { ca: string; uid: string } {
  try {
    const o = decodeCursor(cursor) as { ca?: string; uid?: string };
    if (!o?.ca || !o?.uid) throw new Error('invalid');
    return { ca: o.ca, uid: o.uid };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor입니다.');
  }
}

function calcDDay(deadlineAt: Date | null | undefined): string {
  if (!deadlineAt) return '상시';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(deadlineAt);
  deadline.setHours(0, 0, 0, 0);
  const diffMs = deadline.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `D-${diffDays}`;
  if (diffDays === 0) return 'D-Day';
  return '마감';
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

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
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Scrap)
    private readonly scrapRepository: Repository<Scrap>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    private readonly fileService: FileService,
    private readonly dataSource: DataSource,
  ) {}

  async findBySocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: { withDeleted?: boolean },
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { socialProvider: provider, socialId: profile.socialId },
      withDeleted: options?.withDeleted ?? false,
    });
    if (!user) return null;
    return this.alignSocialUserWithProfile(user, provider, profile);
  }

  async findByEmail(
    email: string,
    options?: { withDeleted?: boolean },
  ): Promise<User | null> {
    const trimmed = email?.trim();
    if (!trimmed) return null;
    return this.userRepository.findOne({
      where: { email: trimmed },
      withDeleted: options?.withDeleted ?? false,
    });
  }

  /**
   * 실제 이메일로 조회. `social_provider`+`social_id` 불일치(레거시·탈퇴 계정) 시
   * 동일 provider 이면 socialId 를 정규화해 반환.
   */
  async findByEmailForSocialAuth(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: { withDeleted?: boolean },
  ): Promise<User | null> {
    const trimmed = profile.email?.trim();
    if (!trimmed) return null;
    const user = await this.userRepository.findOne({
      where: { email: trimmed },
      withDeleted: options?.withDeleted ?? false,
    });
    if (!user) return null;
    if (user.socialProvider !== provider) return null;
    return this.alignSocialUserWithProfile(user, provider, profile);
  }

  private async alignSocialUserWithProfile(
    user: User,
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<User> {
    if (user.socialProvider !== provider) {
      return user;
    }
    const profileSocialId = String(profile.socialId).trim();
    const userSocialId = String(user.socialId).trim();
    if (userSocialId !== profileSocialId) {
      this.logger.warn(
        `socialId mismatch on userId=${user.userId}, normalizing from ${userSocialId} to ${profileSocialId}`,
      );
      user.socialId = profile.socialId;
      await this.userRepository.save(user);
    }
    if (
      !user.deletedAt &&
      profile.profileImgUrl &&
      profile.profileImgUrl !== user.profileImgUrl
    ) {
      user.profileImgUrl = profile.profileImgUrl;
      await this.userRepository.save(user);
    }
    return user;
  }

  /** soft-delete 된 소셜 계정 row 복구 (이메일 UNIQUE 와 가입 재시도 충돌 방지) */
  async reactivateUser(userId: string): Promise<void> {
    await this.userRepository.restore({ userId });
  }

  /** 유예 기간 내 탈퇴 계정을 영구 삭제 — 복구 거부 후 동일 소셜로 신규 가입할 때 */
  async hardDeleteSoftDeletedUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { userId },
      withDeleted: true,
    });
    if (!user?.deletedAt) {
      throw new BadRequestException(
        '탈퇴 상태의 계정만 영구 삭제할 수 있습니다.',
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await hardDeleteUserCascade(manager, userId);
    });
  }

  /**
   * 이메일 미동의 시 쓰는 placeholder(`{provider}_{socialId}@social.placeholder`)로 조회.
   * `social_provider`+`social_id` 조회가 실패해도 UNIQUE 이메일 충돌 나는 레거시/불일치 대응.
   */
  async findBySocialPlaceholderEmail(
    provider: SocialProvider,
    profile: SocialProfile,
    options?: { withDeleted?: boolean },
  ): Promise<User | null> {
    if (profile.email?.trim()) return null;
    const socialId = profile.socialId;
    const email = `${provider}_${socialId}@social.placeholder`;
    const user = await this.userRepository.findOne({
      where: { email },
      withDeleted: options?.withDeleted ?? false,
    });
    if (!user) return null;
    if (user.socialProvider !== provider) return null;
    return this.alignSocialUserWithProfile(user, provider, profile);
  }

  async createBySocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options: { name?: string; activityName: string; role?: UserRole },
  ): Promise<User> {
    const trimmedName = options.name?.trim();
    const name = trimmedName
      ? await this.resolveName(trimmedName, provider, profile.socialId)
      : null;
    const activityName = options.activityName.trim();
    const email =
      profile.email || `${provider}_${profile.socialId}@social.placeholder`;

    const existingByEmail = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });
    if (existingByEmail) {
      throw new ConflictException(
        existingByEmail.deletedAt
          ? '탈퇴한 계정이 있습니다. 로그인 후 계정 복구를 진행해 주세요.'
          : '이미 가입된 이메일입니다. 로그인을 시도해 주세요.',
      );
    }

    const user = this.userRepository.create({
      name,
      activityName,
      aboutMe: '',
      email,
      role: this.coerceUserRole(options.role),
      phoneNumber: '0000000000000',
      isEmailSubscribed: false,
      isPushEnabled: false,
      pushEnabledFollow: true,
      pushEnabledApplication: true,
      pushEnabledReview: true,
      pushEnabledInquiry: true,
      pushEnabledComment: true,
      pushEnabledLike: true,
      isPortfolioPrivate: false,
      artTempo: 0,
      profileImgUrl: profile.profileImgUrl || '',
      socialId: profile.socialId,
      socialProvider: provider,
    });

    return this.userRepository.save(user);
  }

  /** DB enum 은 user | admin 만 허용. 그 외 값(예: artist)은 user 로 저장 */
  private coerceUserRole(input?: UserRole | string): UserRole {
    if (input === UserRole.ADMIN || input === 'admin') {
      return UserRole.ADMIN;
    }
    if (input === UserRole.USER || input === 'user') {
      return UserRole.USER;
    }
    if (input != null && input !== '') {
      this.logger.debug(`Ignoring unknown role "${String(input)}", using USER`);
    }
    return UserRole.USER;
  }

  private async resolveName(
    base: string,
    provider: string,
    socialId: string,
  ): Promise<string> {
    const sanitized = base.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 20);
    if (!sanitized) {
      throw new BadRequestException('유효한 이름을 입력해 주세요.');
    }
    const fallback = `u_${provider}_${socialId}`.slice(0, 20);
    return this.pickAvailableName(sanitized, fallback);
  }

  /** 표시용 이름 — 다른 활성 계정과 겹치면 숫자 접미사로 자동 조정 */
  private async pickAvailableName(
    preferred: string,
    fallback: string,
  ): Promise<string> {
    const maxLen = 20;

    const isTaken = async (nick: string) =>
      Boolean(await this.userRepository.findOne({ where: { name: nick } }));

    if (!(await isTaken(preferred))) {
      return preferred;
    }

    for (let i = 2; i <= 99; i++) {
      const suffix = `_${i}`;
      const candidate = `${preferred.slice(0, maxLen - suffix.length)}${suffix}`;
      if (!(await isTaken(candidate))) {
        return candidate;
      }
    }

    return fallback;
  }

  create(createUserDto: CreateUserDto) {
    return this.userRepository.save(createUserDto);
  }

  findOne(userId: string) {
    return this.userRepository.findOne({ where: { userId } });
  }

  /** JWT·리프레시 검증용 — 신고 자동 정지 만료 시 복구 후 반환 */
  async findOneForAuth(userId: string) {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) return null;
    return liftExpiredReportBanIfNeeded(user, (u) => this.userRepository.save(u));
  }

  async listBannedForAdmin(query: ListBannedUsersQueryDto) {
    const limit = query.limit ?? 8;
    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.userId',
        'user.name',
        'user.activityName',
        'user.email',
        'user.activity',
        'user.reportBannedUntil',
        'user.reportStrikeResetAt',
        'user.createdAt',
      ])
      .where('user.activity = :activity', { activity: UserActivity.BAN })
      .orderBy('user.reportBannedUntil', 'ASC')
      .addOrderBy('user.createdAt', 'DESC')
      .addOrderBy('user.userId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { n, b, t, u } = decodeBannedUserCursor(query.cursor);
      if (n) {
        qb.andWhere(
          `(user.reportBannedUntil IS NOT NULL)
           OR (user.reportBannedUntil IS NULL AND (user.createdAt < :t OR (user.createdAt = :t AND user.userId < :u)))`,
          { t: new Date(t), u },
        );
      } else {
        qb.andWhere(
          `user.reportBannedUntil IS NOT NULL
           AND (user.reportBannedUntil > :b
                OR (user.reportBannedUntil = :b AND (user.createdAt < :t OR (user.createdAt = :t AND user.userId < :u))))`,
          { b: new Date(b as string), t: new Date(t), u },
        );
      }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeBannedUserCursor(last.reportBannedUntil, last.createdAt, last.userId)
        : null;

    return {
      items: slice.map((user) => ({
        userId: user.userId,
        name: user.name,
        activityName: user.activityName,
        email: user.email,
        reportBannedUntil: user.reportBannedUntil?.toISOString() ?? null,
        reportStrikeResetAt: user.reportStrikeResetAt?.toISOString() ?? null,
        banType: user.reportBannedUntil ? 'auto_report' : 'manual',
        createdAt: user.createdAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  async unbanUserForAdmin(userId: string) {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    if (user.activity !== UserActivity.BAN) {
      throw new BadRequestException('정지 상태가 아닌 계정입니다.');
    }

    user.activity = UserActivity.NORMAL;
    user.reportBannedUntil = null;
    user.reportStrikeResetAt = new Date();
    await this.userRepository.save(user);

    return {
      ok: true,
      userId: user.userId,
      name: user.name,
      activityName: user.activityName,
    };
  }

  async findAdminForWebLogin(email?: string) {
    if (email?.trim()) {
      return this.userRepository.findOne({
        where: { email: email.trim(), role: UserRole.ADMIN },
      });
    }
    return this.userRepository.findOne({
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 본인 계정 소프트 삭제 — FCM 기기 행 삭제 후 `user.deleted_at` 설정.
   * Access JWT는 이후 검증에서 거부, Refresh는 `findOne`에서 탈퇴 사용자 제외로 거부된다.
   */
  async deleteMyAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    await this.userRepository.manager.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .delete()
        .from(UserPushDevice)
        .where('user_id = :userId', { userId })
        .execute();
      await em.softDelete(User, { userId });
    });
  }

  /**
   * `deletedAt` 이 retentionDays 일보다 오래된 소프트 삭제 사용자를 물리 삭제한다.
   * 스케줄러에서 호출한다.
   */
  async purgeSoftDeletedUsersOlderThanDays(
    retentionDays: number,
  ): Promise<PurgeExpiredSoftDeletedUsersResult> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const candidates = await this.userRepository
      .createQueryBuilder('u')
      .withDeleted()
      .where('u.deletedAt IS NOT NULL')
      .andWhere('u.deletedAt < :cutoff', { cutoff })
      .select(['u.userId'])
      .getMany();

    const purgedUserIds: string[] = [];
    for (const { userId } of candidates) {
      try {
        await this.dataSource.transaction(async (manager) => {
          await hardDeleteUserCascade(manager, userId);
        });
        purgedUserIds.push(userId);
      } catch (err) {
        this.logger.error(
          `탈퇴 사용자 물리 삭제 실패 userId=${userId}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    return {
      retentionDays,
      cutoffAt: cutoff.toISOString(),
      purgedCount: purgedUserIds.length,
      purgedUserIds,
    };
  }

  async getMyProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userRepository.findOne({
      where: { userId },
      relations: ['educations', 'careers', 'awards', 'certificates', 'major'],
      select: [
        'userId',
        'profileImgUrl',
        'coverImgUrl',
        'activityName',
        'name',
        'role',
        'aboutMe',
        'majorDetail',
        'selfIntroduction',
        'email',
        'phoneNumber',
        'isPortfolioPrivate',
      ],
    });
    if (!user) {
      throw new NotFoundException('프로필을 찾을 수 없습니다.');
    }

    const [followingCount, followerCount] = await Promise.all([
      this.followRepository.count({ where: { senderId: userId } }),
      this.followRepository.count({ where: { receiverId: userId } }),
    ]);

    return {
      userId: user.userId,
      profileImgUrl: user.profileImgUrl,
      coverImgUrl: user.coverImgUrl ?? '',
      name: user.name,
      activityName: user.activityName,
      role: user.role,
      aboutMe: user.aboutMe,
      majorDetail: user.majorDetail,
      selfIntroduction: user.selfIntroduction,
      educations: user.educations ?? null,
      careers: user.careers ?? null,
      awards: user.awards ?? null,
      certificates: user.certificates ?? null,
      major: user.major ?? null,
      contact: {
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      followingCount,
      followerCount,
      isPortfolioPrivate: user.isPortfolioPrivate ?? false,
    };
  }

  async ensurePortfolioPublic(userId: string): Promise<void> {
    await this.assertPortfolioVisible(userId);
  }

  private async assertPortfolioVisible(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { userId },
      select: ['userId', 'isPortfolioPrivate'],
    });
    if (!user) {
      throw new NotFoundException('프로필을 찾을 수 없습니다.');
    }
    if (user.isPortfolioPrivate) {
      throw new ForbiddenException('비공개 프로필입니다.');
    }
  }

  /**
   * 타인 프로필(포트폴리오) — 내 프로필 조회와 동일 필드, 연락처 제외
   */
  async getPublicProfile(userId: string): Promise<PublicProfileResponseDto> {
    await this.assertPortfolioVisible(userId);

    const user = await this.userRepository.findOne({
      where: { userId },
      relations: ['educations', 'careers', 'awards', 'certificates', 'major'],
      select: [
        'userId',
        'profileImgUrl',
        'coverImgUrl',
        'activityName',
        'name',
        'role',
        'aboutMe',
        'majorDetail',
        'selfIntroduction',
      ],
    });
    if (!user) {
      throw new NotFoundException('프로필을 찾을 수 없습니다.');
    }

    const [followingCount, followerCount] = await Promise.all([
      this.followRepository.count({ where: { senderId: userId } }),
      this.followRepository.count({ where: { receiverId: userId } }),
    ]);

    return {
      userId: user.userId,
      profileImgUrl: user.profileImgUrl,
      coverImgUrl: user.coverImgUrl ?? '',
      name: user.name,
      activityName: user.activityName,
      role: user.role,
      aboutMe: user.aboutMe,
      majorDetail: user.majorDetail,
      selfIntroduction: user.selfIntroduction,
      educations: user.educations ?? null,
      careers: user.careers ?? null,
      awards: user.awards ?? null,
      certificates: user.certificates ?? null,
      major: user.major ?? null,
      followingCount,
      followerCount,
    };
  }

  async updateMyProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
    profileImage?: Express.Multer.File,
    coverImage?: Express.Multer.File,
  ) {
    const user = await this.userRepository.findOne({
      where: { userId },
      relations: ['educations', 'careers', 'awards', 'certificates', 'major'],
    });
    if (!user) {
      throw new NotFoundException('프로필을 찾을 수 없습니다.');
    }

    const { educations, careers, awards, certificates, majorId, ...scalarFields } =
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

    if (profileImage) {
      const uploaded = await this.fileService.uploadAndSave({
        buffer: profileImage.buffer,
        originalName: profileImage.originalname,
        contentType: profileImage.mimetype,
        targetType: null,
        targetId: null,
        sortOrder: 0,
      });
      user.profileImgUrl = uploaded.imgUrl;
    } else if (updateUserDto.profileImgUrl === '') {
      user.profileImgUrl = '';
    }

    if (updateUserDto.majorDetail !== undefined) {
      const trimmed = updateUserDto.majorDetail?.trim() ?? '';
      user.majorDetail = trimmed || null;
    }

    if (coverImage) {
      const uploaded = await this.fileService.uploadAndSave({
        buffer: coverImage.buffer,
        originalName: coverImage.originalname,
        contentType: coverImage.mimetype,
        targetType: null,
        targetId: null,
        sortOrder: 0,
      });
      user.coverImgUrl = uploaded.imgUrl;
    } else if (updateUserDto.coverImgUrl === '') {
      user.coverImgUrl = '';
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

    if (certificates) {
      await this.syncCertificates(savedUser, certificates);
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
      const startedAt =
        dto.startedAt != null && dto.startedAt !== ''
          ? new Date(dto.startedAt)
          : null;
      const isOngoing = dto.isOngoing ?? false;
      const endedAt =
        isOngoing || dto.endedAt == null || dto.endedAt === ''
          ? null
          : new Date(dto.endedAt);
      if (dto.educationId && existingMap.has(dto.educationId)) {
        const entity = existingMap.get(dto.educationId) as Education;
        entity.description = dto.description;
        entity.startedAt = startedAt;
        entity.endedAt = endedAt;
        entity.isOngoing = isOngoing;
        toSave.push(entity);
      } else {
        const entity = this.educationRepository.create({
          description: dto.description,
          startedAt,
          endedAt,
          isOngoing,
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
      const startedAt =
        dto.startedAt != null && dto.startedAt !== ''
          ? new Date(dto.startedAt)
          : null;
      const isOngoing = dto.isOngoing ?? false;
      const endedAt =
        isOngoing || dto.endedAt == null || dto.endedAt === ''
          ? null
          : new Date(dto.endedAt);
      const organization = dto.organization?.trim()
        ? dto.organization.trim().slice(0, 10)
        : null;
      if (dto.careerId && existingMap.has(dto.careerId)) {
        const entity = existingMap.get(dto.careerId) as Career;
        entity.description = dto.description;
        entity.startedAt = startedAt;
        entity.endedAt = endedAt;
        entity.isOngoing = isOngoing;
        entity.organization = organization;
        toSave.push(entity);
      } else {
        const entity = this.careerRepository.create({
          description: dto.description,
          startedAt,
          endedAt,
          isOngoing,
          organization,
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
      const awardedAt =
        dto.awardedAt != null && dto.awardedAt !== ''
          ? new Date(dto.awardedAt)
          : null;
      const organization = dto.organization?.trim()
        ? dto.organization.trim().slice(0, 10)
        : null;
      if (dto.awardId && existingMap.has(dto.awardId)) {
        const entity = existingMap.get(dto.awardId) as Award;
        entity.description = dto.description;
        entity.awardedAt = awardedAt;
        entity.organization = organization;
        toSave.push(entity);
      } else {
        const entity = this.awardRepository.create({
          description: dto.description,
          awardedAt,
          organization,
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

  private async syncCertificates(
    user: User,
    certificateDtos: UpdateCertificateDto[],
  ) {
    const existing: Certificate[] = user.certificates ?? [];
    const existingMap = new Map<string, Certificate>(
      existing.map((c: Certificate) => [c.certificateId, c]),
    );

    const incomingIds = new Set(
      certificateDtos
        .map((c: UpdateCertificateDto) => c.certificateId)
        .filter((id): id is string => Boolean(id)),
    );

    const toSave: Certificate[] = [];

    for (const dto of certificateDtos) {
      const obtainedAt =
        dto.obtainedAt != null && dto.obtainedAt !== ''
          ? new Date(dto.obtainedAt)
          : null;
      const organization = dto.organization?.trim()
        ? dto.organization.trim().slice(0, 10)
        : null;
      if (dto.certificateId && existingMap.has(dto.certificateId)) {
        const entity = existingMap.get(dto.certificateId) as Certificate;
        entity.description = dto.description;
        entity.obtainedAt = obtainedAt;
        entity.organization = organization;
        toSave.push(entity);
      } else {
        const entity = this.certificateRepository.create({
          description: dto.description,
          obtainedAt,
          organization,
          user,
        });
        toSave.push(entity);
      }
    }

    const toDeleteIds = existing
      .filter((c: Certificate) => !incomingIds.has(c.certificateId))
      .map((c: Certificate) => c.certificateId);

    if (toDeleteIds.length) {
      await this.certificateRepository.delete({
        certificateId: In(toDeleteIds),
      });
    }

    if (toSave.length) {
      await this.certificateRepository.save(toSave);
    }
  }

  async checkActivityNameAvailable(
    activityName: string,
  ): Promise<{ available: boolean }> {
    if (!activityName?.trim()) {
      return { available: false };
    }
    const existing = await this.userRepository.findOne({
      where: { activityName: activityName.trim() },
    });
    return { available: !existing };
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
      name: user.name,
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
        'user.name',
        'user.activityName',
      ])
      .orderBy('RAND()')
      .take(limit)
      .getMany();

    return users.map((user) => ({
      userId: user.userId,
      profileImgUrl: user.profileImgUrl,
      name: user.name,
      activityName: user.activityName,
    }));
  }

  async getMyWrittenPosts(userId: string, query: ListMyWrittenPostsQueryDto) {
    const limit = query.limit ?? 8;

    const communityQb = this.communityRepository
      .createQueryBuilder('community')
      .leftJoinAndSelect('community.category', 'category')
      .leftJoinAndSelect('community.file', 'file')
      .where('community.user_id = :userId', { userId })
      .orderBy('community.createdAt', 'DESC')
      .addOrderBy('community.communityId', 'DESC')
      .take(limit + 1);
    if (query.communityCursor) {
      const { t, i } = decodeMyPostsCursor(query.communityCursor);
      communityQb.andWhere(
        '(community.createdAt < :ca OR (community.createdAt = :ca AND community.communityId < :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const newsQb = this.newsRepository
      .createQueryBuilder('news')
      .leftJoinAndSelect('news.file', 'file')
      .where('news.user_id = :userId', { userId })
      .orderBy('news.createdAt', 'DESC')
      .addOrderBy('news.newsId', 'DESC')
      .take(limit + 1);
    if (query.newsCursor) {
      const { t, i } = decodeMyPostsCursor(query.newsCursor);
      newsQb.andWhere(
        '(news.createdAt < :ca OR (news.createdAt = :ca AND news.newsId < :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const announcementQb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.category', 'category')
      .where('announcement.userId = :userId', { userId })
      .orderBy('announcement.postId', 'DESC')
      .take(limit + 1);
    if (query.announcementCursor) {
      const { i } = decodeMyAnnouncementPostsCursor(query.announcementCursor);
      announcementQb.andWhere('announcement.postId < :cid', { cid: i });
    }

    const [communityRows, newsRows, announcementRows] = await Promise.all([
      communityQb.getMany(),
      newsQb.getMany(),
      announcementQb.getMany(),
    ]);

    const communityHasMore = communityRows.length > limit;
    const communities = communityHasMore
      ? communityRows.slice(0, limit)
      : communityRows;
    const newsHasMore = newsRows.length > limit;
    const news = newsHasMore ? newsRows.slice(0, limit) : newsRows;
    const announcementHasMore = announcementRows.length > limit;
    const announcements = announcementHasMore
      ? announcementRows.slice(0, limit)
      : announcementRows;

    const [communityLikeCountMap, communityCommentCountMap] = await Promise.all(
      [
        this.getLikeCountMap(
          LikeType.COMMUNITY,
          communities.map((item) => item.communityId),
        ),
        this.getCommentCountMap(
          CommentTargetType.COMMUNITY,
          communities.map((item) => item.communityId),
        ),
      ],
    );

    const [newsLikeCountMap, newsCommentCountMap] = await Promise.all([
      this.getLikeCountMap(
        LikeType.NEWS,
        news.map((item) => item.newsId),
      ),
      this.getCommentCountMap(
        CommentTargetType.NEWS,
        news.map((item) => item.newsId),
      ),
    ]);

    const announcementLikeCountMap = await this.getLikeCountMap(
      LikeType.ANNOUNCEMENT,
      announcements.map((item) => item.postId),
    );

    const [communityThumbMap, newsThumbMap] = await Promise.all([
      this.buildCommunityThumbnailUrlMap(communities),
      this.buildNewsThumbnailUrlMap(news),
    ]);

    const lastCommunity = communities[communities.length - 1];
    const lastNews = news[news.length - 1];
    const lastAnnouncement = announcements[announcements.length - 1];

    return {
      community: {
        items: communities.map((item: Community) => ({
          communityId: item.communityId,
          title: item.title,
          category: item.category?.name ?? null,
          createdAt: item.createdAt,
          likeCount: communityLikeCountMap.get(item.communityId) ?? 0,
          viewCount: Number(item.viewCount ?? 0),
          commentCount: communityCommentCountMap.get(item.communityId) ?? 0,
          thumbnailUrl: communityThumbMap.get(item.communityId) ?? null,
        })),
        nextCursor:
          communityHasMore && lastCommunity
            ? encodeMyPostsCursor(lastCommunity.createdAt, lastCommunity.communityId)
            : null,
        hasMore: communityHasMore,
      },
      news: {
        items: news.map((item: News) => ({
          newsId: item.newsId,
          title: item.title,
          place: item.place,
          createdAt: item.createdAt,
          likeCount: newsLikeCountMap.get(item.newsId) ?? 0,
          viewCount: Number(item.viewCount ?? 0),
          commentCount: newsCommentCountMap.get(item.newsId) ?? 0,
          thumbnailUrl: newsThumbMap.get(item.newsId) ?? null,
        })),
        nextCursor:
          newsHasMore && lastNews
            ? encodeMyPostsCursor(lastNews.createdAt, lastNews.newsId)
            : null,
        hasMore: newsHasMore,
      },
      announcements: {
        items: announcements.map((item: Announcement) => ({
          postId: item.postId,
          title: item.title,
          category: item.category?.name ?? null,
          scheduledAt: item.scheduledAt,
          deadlineAt: item.deadlineAt,
          priceType: item.priceType,
          price: item.price,
          likeCount: announcementLikeCountMap.get(item.postId) ?? 0,
          viewCount: 0,
          commentCount: 0,
        })),
        nextCursor:
          announcementHasMore && lastAnnouncement
            ? encodeMyAnnouncementPostsCursor(lastAnnouncement.postId)
            : null,
        hasMore: announcementHasMore,
      },
    };
  }

  async getMyNewsPosts(userId: string, query: ListMyScrapQueryDto) {
    const limit = query.limit ?? 8;
    const qb = this.newsRepository
      .createQueryBuilder('news')
      .leftJoinAndSelect('news.file', 'file')
      .where('news.user_id = :userId', { userId })
      .orderBy('news.createdAt', 'DESC')
      .addOrderBy('news.newsId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeMyPostsCursor(query.cursor);
      qb.andWhere(
        '(news.createdAt < :ca OR (news.createdAt = :ca AND news.newsId < :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const news = hasMore ? rows.slice(0, limit) : rows;

    const [newsLikeCountMap, newsCommentCountMap, newsThumbMap] =
      await Promise.all([
        this.getLikeCountMap(
          LikeType.NEWS,
          news.map((item) => item.newsId),
        ),
        this.getCommentCountMap(
          CommentTargetType.NEWS,
          news.map((item) => item.newsId),
        ),
        this.buildNewsThumbnailUrlMap(news),
      ]);

    const items = news.map((item: News) => ({
      newsId: item.newsId,
      title: item.title,
      place: item.place,
      createdAt: item.createdAt,
      likeCount: newsLikeCountMap.get(item.newsId) ?? 0,
      viewCount: Number(item.viewCount ?? 0),
      commentCount: newsCommentCountMap.get(item.newsId) ?? 0,
      thumbnailUrl: newsThumbMap.get(item.newsId) ?? null,
    }));

    const last = news[news.length - 1];
    const nextCursor =
      hasMore && last ? encodeMyPostsCursor(last.createdAt, last.newsId) : null;

    return { items, nextCursor, hasMore };
  }

  async getMyCommentPosts(userId: string, query: ListMyScrapQueryDto) {
    const limit = query.limit ?? 8;
    const qb = this.commentRepository
      .createQueryBuilder('comment')
      .where('comment.user_id = :userId', { userId })
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeMyPostsCursor(query.cursor);
      qb.andWhere(
        '(comment.createdAt < :ca OR (comment.createdAt = :ca AND comment.id < :cid))',
        { ca: new Date(t), cid: i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const comments = hasMore ? rows.slice(0, limit) : rows;

    const newsIds = [
      ...new Set(
        comments
          .filter((c) => c.targetType === CommentTargetType.NEWS)
          .map((c) => c.targetId),
      ),
    ];
    const communityIds = [
      ...new Set(
        comments
          .filter((c) => c.targetType === CommentTargetType.COMMUNITY)
          .map((c) => c.targetId),
      ),
    ];

    const [newsRows, communityRows] = await Promise.all([
      newsIds.length
        ? this.newsRepository.find({
            where: { newsId: In(newsIds) },
            select: ['newsId', 'title'],
          })
        : Promise.resolve([]),
      communityIds.length
        ? this.communityRepository.find({
            where: { communityId: In(communityIds) },
            select: ['communityId', 'title'],
          })
        : Promise.resolve([]),
    ]);

    const newsTitleMap = new Map(newsRows.map((row) => [row.newsId, row.title]));
    const communityTitleMap = new Map(
      communityRows.map((row) => [row.communityId, row.title]),
    );

    const items = comments.map((comment) => ({
      commentId: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      targetType: comment.targetType,
      targetId: comment.targetId,
      postTitle:
        comment.targetType === CommentTargetType.NEWS
          ? (newsTitleMap.get(comment.targetId) ?? null)
          : (communityTitleMap.get(comment.targetId) ?? null),
    }));

    const last = comments[comments.length - 1];
    const nextCursor =
      hasMore && last ? encodeMyPostsCursor(last.createdAt, last.id) : null;

    return { items, nextCursor, hasMore };
  }

  async getMyAnnouncementPosts(userId: string, query: ListMyScrapQueryDto) {
    const limit = query.limit ?? 8;
    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoinAndSelect('announcement.category', 'category')
      .where('announcement.userId = :userId', { userId })
      .orderBy('announcement.postId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { i } = decodeMyAnnouncementPostsCursor(query.cursor);
      qb.andWhere('announcement.postId < :cid', { cid: i });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const announcements = hasMore ? rows.slice(0, limit) : rows;

    const announcementLikeCountMap = await this.getLikeCountMap(
      LikeType.ANNOUNCEMENT,
      announcements.map((item) => item.postId),
    );

    const items = announcements.map((item: Announcement) => ({
      postId: item.postId,
      title: item.title,
      category: item.category?.name ?? null,
      scheduledAt: item.scheduledAt,
      deadlineAt: item.deadlineAt,
      status: item.status,
      priceType: item.priceType,
      price: item.price,
      likeCount: announcementLikeCountMap.get(item.postId) ?? 0,
      viewCount: 0,
      commentCount: 0,
    }));

    const last = announcements[announcements.length - 1];
    const nextCursor =
      hasMore && last ? encodeMyAnnouncementPostsCursor(last.postId) : null;

    return { items, nextCursor, hasMore };
  }

  async getMyScrappedAnnouncementPosts(
    userId: string,
    query: ListMyScrapQueryDto,
  ) {
    const { cursor, limit = 8 } = query;

    const qb = this.scrapRepository
      .createQueryBuilder('scrap')
      .innerJoin(
        Announcement,
        'announcement',
        'announcement.postId = scrap.targetId',
      )
      .leftJoin('announcement.category', 'category')
      .select([
        'scrap.id AS scrapId',
        'scrap.createdAt AS scrappedAt',
        'announcement.postId AS postId',
        'announcement.title AS title',
        'announcement.status AS status',
        'announcement.deadlineAt AS deadlineAt',
        'announcement.price_type AS priceType',
        'announcement.price AS price',
        'category.name AS categoryName',
      ])
      .where('scrap.user_id = :userId', { userId })
      .andWhere('scrap.target_type = :targetType', {
        targetType: ScrapTargetType.ANNOUNCEMENT,
      })
      .orderBy('scrap.createdAt', 'DESC')
      .addOrderBy('scrap.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        qb.andWhere('scrap.createdAt < :cursorDate', { cursorDate });
      }
    }

    const rows = await qb.getRawMany<{
      scrapId: string;
      scrappedAt: Date;
      postId: string;
      title: string;
      status: string;
      deadlineAt: Date;
      priceType: string;
      price: number;
      categoryName: string | null;
    }>();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const items = sliced.map((row) => ({
      scrapId: row.scrapId,
      scrappedAt: row.scrappedAt,
      postId: row.postId,
      title: row.title,
      type: row.categoryName ?? '기타',
      isRecruiting: row.status === 'OPEN',
      dDay: calcDDay(new Date(row.deadlineAt)),
      priceType: row.priceType,
      price: row.price,
    }));

    const nextCursor = hasMore
      ? new Date(items[items.length - 1].scrappedAt).toISOString()
      : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async getMyScrappedCommunityPosts(
    userId: string,
    query: ListMyScrapQueryDto,
  ) {
    const { cursor, limit = 8 } = query;

    const qb = this.scrapRepository
      .createQueryBuilder('scrap')
      .innerJoin(
        Community,
        'community',
        'community.communityId = scrap.targetId',
      )
      .leftJoin('community.category', 'category')
      .select([
        'scrap.id AS scrapId',
        'scrap.createdAt AS scrappedAt',
        'community.communityId AS communityId',
        'community.title AS title',
        'community.createdAt AS createdAt',
        'community.viewCount AS viewCount',
        'category.name AS categoryName',
      ])
      .where('scrap.user_id = :userId', { userId })
      .andWhere('scrap.target_type = :targetType', {
        targetType: ScrapTargetType.COMMUNITY,
      })
      .orderBy('scrap.createdAt', 'DESC')
      .addOrderBy('scrap.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        qb.andWhere('scrap.createdAt < :cursorDate', { cursorDate });
      }
    }

    const rows = await qb.getRawMany<{
      scrapId: string;
      scrappedAt: Date;
      communityId: string;
      title: string;
      createdAt: Date;
      viewCount: number;
      categoryName: string | null;
    }>();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const communityIds = sliced.map((row) => row.communityId);

    const [likeCountMap, commentCountMap] = await Promise.all([
      this.getLikeCountMap(LikeType.COMMUNITY, communityIds),
      this.getCommentCountMap(CommentTargetType.COMMUNITY, communityIds),
    ]);

    const items = sliced.map((row) => ({
      scrapId: row.scrapId,
      scrappedAt: row.scrappedAt,
      communityId: row.communityId,
      title: row.title,
      category: row.categoryName ?? null,
      createdAt: row.createdAt,
      likeCount: likeCountMap.get(row.communityId) ?? 0,
      viewCount: Number(row.viewCount ?? 0),
      commentCount: commentCountMap.get(row.communityId) ?? 0,
    }));

    const nextCursor = hasMore
      ? new Date(items[items.length - 1].scrappedAt).toISOString()
      : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async getMyScrappedNewsPosts(userId: string, query: ListMyScrapQueryDto) {
    const { cursor, limit = 8 } = query;

    const qb = this.scrapRepository
      .createQueryBuilder('scrap')
      .innerJoin(News, 'news', 'news.newsId = scrap.targetId')
      .select([
        'scrap.id AS scrapId',
        'scrap.createdAt AS scrappedAt',
        'news.newsId AS newsId',
        'news.title AS title',
        'news.place AS place',
        'news.createdAt AS createdAt',
        'news.viewCount AS viewCount',
      ])
      .where('scrap.user_id = :userId', { userId })
      .andWhere('scrap.target_type = :targetType', {
        targetType: ScrapTargetType.NEWS,
      })
      .orderBy('scrap.createdAt', 'DESC')
      .addOrderBy('scrap.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        qb.andWhere('scrap.createdAt < :cursorDate', { cursorDate });
      }
    }

    const rows = await qb.getRawMany<{
      scrapId: string;
      scrappedAt: Date;
      newsId: string;
      title: string;
      place: string;
      createdAt: Date;
      viewCount: number;
    }>();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const newsIds = sliced.map((row) => row.newsId);

    const [likeCountMap, commentCountMap] = await Promise.all([
      this.getLikeCountMap(LikeType.NEWS, newsIds),
      this.getCommentCountMap(CommentTargetType.NEWS, newsIds),
    ]);

    const items = sliced.map((row) => ({
      scrapId: row.scrapId,
      scrappedAt: row.scrappedAt,
      newsId: row.newsId,
      title: row.title,
      place: row.place,
      createdAt: row.createdAt,
      likeCount: likeCountMap.get(row.newsId) ?? 0,
      viewCount: Number(row.viewCount ?? 0),
      commentCount: commentCountMap.get(row.newsId) ?? 0,
    }));

    const nextCursor = hasMore
      ? new Date(items[items.length - 1].scrappedAt).toISOString()
      : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async getMyScrappedPostHighlights(userId: string) {
    const [latestCommunityRows, recentNewsRows] = await Promise.all([
      this.scrapRepository
        .createQueryBuilder('scrap')
        .innerJoin(
          Community,
          'community',
          'community.communityId = scrap.targetId',
        )
        .leftJoin('community.category', 'category')
        .select([
          'scrap.id AS scrapId',
          'scrap.createdAt AS scrappedAt',
          'community.communityId AS communityId',
          'community.title AS title',
          'community.createdAt AS createdAt',
          'community.viewCount AS viewCount',
          'category.name AS categoryName',
        ])
        .where('scrap.user_id = :userId', { userId })
        .andWhere('scrap.target_type = :targetType', {
          targetType: ScrapTargetType.COMMUNITY,
        })
        .orderBy('scrap.createdAt', 'DESC')
        .addOrderBy('scrap.id', 'DESC')
        .take(1)
        .getRawMany<{
          scrapId: string;
          scrappedAt: Date;
          communityId: string;
          title: string;
          createdAt: Date;
          viewCount: number;
          categoryName: string | null;
        }>(),
      this.scrapRepository
        .createQueryBuilder('scrap')
        .innerJoin(News, 'news', 'news.newsId = scrap.targetId')
        .select([
          'scrap.id AS scrapId',
          'scrap.createdAt AS scrappedAt',
          'news.newsId AS newsId',
          'news.title AS title',
          'news.place AS place',
          'news.createdAt AS createdAt',
          'news.viewCount AS viewCount',
        ])
        .where('scrap.user_id = :userId', { userId })
        .andWhere('scrap.target_type = :targetType', {
          targetType: ScrapTargetType.NEWS,
        })
        .orderBy('scrap.createdAt', 'DESC')
        .addOrderBy('scrap.id', 'DESC')
        .take(5)
        .getRawMany<{
          scrapId: string;
          scrappedAt: Date;
          newsId: string;
          title: string;
          place: string;
          createdAt: Date;
          viewCount: number;
        }>(),
    ]);

    const latestCommunity = latestCommunityRows[0] ?? null;
    const communityIds = latestCommunity ? [latestCommunity.communityId] : [];
    const newsIds = recentNewsRows.map((row) => row.newsId);

    const [communityLikeCountMap, communityCommentCountMap] = await Promise.all(
      [
        this.getLikeCountMap(LikeType.COMMUNITY, communityIds),
        this.getCommentCountMap(CommentTargetType.COMMUNITY, communityIds),
      ],
    );
    const [newsLikeCountMap, newsCommentCountMap] = await Promise.all([
      this.getLikeCountMap(LikeType.NEWS, newsIds),
      this.getCommentCountMap(CommentTargetType.NEWS, newsIds),
    ]);

    return {
      latestScrappedCommunity: latestCommunity
        ? {
            scrapId: latestCommunity.scrapId,
            scrappedAt: latestCommunity.scrappedAt,
            communityId: latestCommunity.communityId,
            title: latestCommunity.title,
            category: latestCommunity.categoryName ?? null,
            createdAt: latestCommunity.createdAt,
            likeCount:
              communityLikeCountMap.get(latestCommunity.communityId) ?? 0,
            viewCount: Number(latestCommunity.viewCount ?? 0),
            commentCount:
              communityCommentCountMap.get(latestCommunity.communityId) ?? 0,
          }
        : null,
      latestScrappedNews: recentNewsRows.map((row) => ({
        scrapId: row.scrapId,
        scrappedAt: row.scrappedAt,
        newsId: row.newsId,
        title: row.title,
        place: row.place,
        createdAt: row.createdAt,
        likeCount: newsLikeCountMap.get(row.newsId) ?? 0,
        viewCount: Number(row.viewCount ?? 0),
        commentCount: newsCommentCountMap.get(row.newsId) ?? 0,
      })),
    };
  }

  async getMyLikedCommunityPosts(userId: string, query: ListMyScrapQueryDto) {
    const { cursor, limit = 8 } = query;

    const qb = this.likeRepository
      .createQueryBuilder('like')
      .innerJoin(
        Community,
        'community',
        'community.communityId = like.targetId',
      )
      .leftJoin('community.category', 'category')
      .select([
        'like.id AS likeId',
        'like.createdAt AS likedAt',
        'community.communityId AS communityId',
        'community.title AS title',
        'community.createdAt AS createdAt',
        'community.viewCount AS viewCount',
        'category.name AS categoryName',
      ])
      .where('like.user_id = :userId', { userId })
      .andWhere('like.like_type = :likeType', {
        likeType: LikeType.COMMUNITY,
      })
      .orderBy('like.createdAt', 'DESC')
      .addOrderBy('like.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        qb.andWhere('like.createdAt < :cursorDate', { cursorDate });
      }
    }

    const rows = await qb.getRawMany<{
      likeId: string;
      likedAt: Date;
      communityId: string;
      title: string;
      createdAt: Date;
      viewCount: number;
      categoryName: string | null;
    }>();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const communityIds = sliced.map((row) => row.communityId);

    const [likeCountMap, commentCountMap] = await Promise.all([
      this.getLikeCountMap(LikeType.COMMUNITY, communityIds),
      this.getCommentCountMap(CommentTargetType.COMMUNITY, communityIds),
    ]);

    const items = sliced.map((row) => ({
      likeId: row.likeId,
      likedAt: row.likedAt,
      communityId: row.communityId,
      title: row.title,
      category: row.categoryName ?? null,
      createdAt: row.createdAt,
      likeCount: likeCountMap.get(row.communityId) ?? 0,
      viewCount: Number(row.viewCount ?? 0),
      commentCount: commentCountMap.get(row.communityId) ?? 0,
    }));

    const nextCursor = hasMore
      ? new Date(items[items.length - 1].likedAt).toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async getMyLikedNewsPosts(userId: string, query: ListMyScrapQueryDto) {
    const { cursor, limit = 8 } = query;

    const qb = this.likeRepository
      .createQueryBuilder('like')
      .innerJoin(News, 'news', 'news.newsId = like.targetId')
      .select([
        'like.id AS likeId',
        'like.createdAt AS likedAt',
        'news.newsId AS newsId',
        'news.title AS title',
        'news.place AS place',
        'news.createdAt AS createdAt',
        'news.viewCount AS viewCount',
      ])
      .where('like.user_id = :userId', { userId })
      .andWhere('like.like_type = :likeType', { likeType: LikeType.NEWS })
      .orderBy('like.createdAt', 'DESC')
      .addOrderBy('like.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        qb.andWhere('like.createdAt < :cursorDate', { cursorDate });
      }
    }

    const rows = await qb.getRawMany<{
      likeId: string;
      likedAt: Date;
      newsId: string;
      title: string;
      place: string;
      createdAt: Date;
      viewCount: number;
    }>();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const newsIds = sliced.map((row) => row.newsId);

    const [likeCountMap, commentCountMap] = await Promise.all([
      this.getLikeCountMap(LikeType.NEWS, newsIds),
      this.getCommentCountMap(CommentTargetType.NEWS, newsIds),
    ]);

    const items = sliced.map((row) => ({
      likeId: row.likeId,
      likedAt: row.likedAt,
      newsId: row.newsId,
      title: row.title,
      place: row.place,
      createdAt: row.createdAt,
      likeCount: likeCountMap.get(row.newsId) ?? 0,
      viewCount: Number(row.viewCount ?? 0),
      commentCount: commentCountMap.get(row.newsId) ?? 0,
    }));

    const nextCursor = hasMore
      ? new Date(items[items.length - 1].likedAt).toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async getMyLikedCommentPosts(userId: string, query: ListMyScrapQueryDto) {
    const { cursor, limit = 8 } = query;

    const qb = this.likeRepository
      .createQueryBuilder('like')
      .innerJoin(Comment, 'comment', 'comment.id = like.targetId')
      .select([
        'like.id AS likeId',
        'like.createdAt AS likedAt',
        'comment.id AS commentId',
        'comment.content AS content',
        'comment.targetType AS targetType',
        'comment.targetId AS targetId',
        'comment.createdAt AS createdAt',
      ])
      .where('like.user_id = :userId', { userId })
      .andWhere('like.like_type = :likeType', { likeType: LikeType.COMMENT })
      .andWhere('comment.deleted_at IS NULL')
      .orderBy('like.createdAt', 'DESC')
      .addOrderBy('like.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        qb.andWhere('like.createdAt < :cursorDate', { cursorDate });
      }
    }

    const rows = await qb.getRawMany<{
      likeId: string;
      likedAt: Date;
      commentId: string;
      content: string;
      targetType: CommentTargetType;
      targetId: string;
      createdAt: Date;
    }>();

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const newsIds = [
      ...new Set(
        sliced
          .filter((row) => row.targetType === CommentTargetType.NEWS)
          .map((row) => row.targetId),
      ),
    ];
    const communityIds = [
      ...new Set(
        sliced
          .filter((row) => row.targetType === CommentTargetType.COMMUNITY)
          .map((row) => row.targetId),
      ),
    ];

    const [newsRows, communityRows] = await Promise.all([
      newsIds.length
        ? this.newsRepository.find({
            where: { newsId: In(newsIds) },
            select: ['newsId', 'title'],
          })
        : Promise.resolve([]),
      communityIds.length
        ? this.communityRepository.find({
            where: { communityId: In(communityIds) },
            select: ['communityId', 'title'],
          })
        : Promise.resolve([]),
    ]);

    const newsTitleMap = new Map(newsRows.map((row) => [row.newsId, row.title]));
    const communityTitleMap = new Map(
      communityRows.map((row) => [row.communityId, row.title]),
    );

    const items = sliced.map((row) => ({
      likeId: row.likeId,
      likedAt: row.likedAt,
      commentId: row.commentId,
      content: row.content,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
      postTitle:
        row.targetType === CommentTargetType.NEWS
          ? (newsTitleMap.get(row.targetId) ?? null)
          : (communityTitleMap.get(row.targetId) ?? null),
    }));

    const nextCursor = hasMore
      ? new Date(items[items.length - 1].likedAt).toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async getMyLikedPostHighlights(userId: string) {
    const [latestCommunityRows, recentNewsRows] = await Promise.all([
      this.likeRepository
        .createQueryBuilder('like')
        .innerJoin(
          Community,
          'community',
          'community.communityId = like.targetId',
        )
        .leftJoin('community.category', 'category')
        .select([
          'like.id AS likeId',
          'like.createdAt AS likedAt',
          'community.communityId AS communityId',
          'community.title AS title',
          'community.createdAt AS createdAt',
          'community.viewCount AS viewCount',
          'category.name AS categoryName',
        ])
        .where('like.user_id = :userId', { userId })
        .andWhere('like.like_type = :likeType', {
          likeType: LikeType.COMMUNITY,
        })
        .orderBy('like.createdAt', 'DESC')
        .addOrderBy('like.id', 'DESC')
        .take(1)
        .getRawMany<{
          likeId: string;
          likedAt: Date;
          communityId: string;
          title: string;
          createdAt: Date;
          viewCount: number;
          categoryName: string | null;
        }>(),
      this.likeRepository
        .createQueryBuilder('like')
        .innerJoin(News, 'news', 'news.newsId = like.targetId')
        .select([
          'like.id AS likeId',
          'like.createdAt AS likedAt',
          'news.newsId AS newsId',
          'news.title AS title',
          'news.place AS place',
          'news.createdAt AS createdAt',
          'news.viewCount AS viewCount',
        ])
        .where('like.user_id = :userId', { userId })
        .andWhere('like.like_type = :likeType', { likeType: LikeType.NEWS })
        .orderBy('like.createdAt', 'DESC')
        .addOrderBy('like.id', 'DESC')
        .take(5)
        .getRawMany<{
          likeId: string;
          likedAt: Date;
          newsId: string;
          title: string;
          place: string;
          createdAt: Date;
          viewCount: number;
        }>(),
    ]);

    const latestCommunity = latestCommunityRows[0] ?? null;
    const communityIds = latestCommunity ? [latestCommunity.communityId] : [];
    const newsIds = recentNewsRows.map((row) => row.newsId);

    const [communityLikeCountMap, communityCommentCountMap] = await Promise.all(
      [
        this.getLikeCountMap(LikeType.COMMUNITY, communityIds),
        this.getCommentCountMap(CommentTargetType.COMMUNITY, communityIds),
      ],
    );
    const [newsLikeCountMap, newsCommentCountMap] = await Promise.all([
      this.getLikeCountMap(LikeType.NEWS, newsIds),
      this.getCommentCountMap(CommentTargetType.NEWS, newsIds),
    ]);

    return {
      latestLikedCommunity: latestCommunity
        ? {
            likeId: latestCommunity.likeId,
            likedAt: latestCommunity.likedAt,
            communityId: latestCommunity.communityId,
            title: latestCommunity.title,
            category: latestCommunity.categoryName ?? null,
            createdAt: latestCommunity.createdAt,
            likeCount:
              communityLikeCountMap.get(latestCommunity.communityId) ?? 0,
            viewCount: Number(latestCommunity.viewCount ?? 0),
            commentCount:
              communityCommentCountMap.get(latestCommunity.communityId) ?? 0,
          }
        : null,
      latestLikedNews: recentNewsRows.map((row) => ({
        likeId: row.likeId,
        likedAt: row.likedAt,
        newsId: row.newsId,
        title: row.title,
        place: row.place,
        createdAt: row.createdAt,
        likeCount: newsLikeCountMap.get(row.newsId) ?? 0,
        viewCount: Number(row.viewCount ?? 0),
        commentCount: newsCommentCountMap.get(row.newsId) ?? 0,
      })),
    };
  }

  async getMyPostHighlights(userId: string) {
    const [latestCommunity, recentNews, latestAnnouncement] = await Promise.all(
      [
        this.communityRepository.findOne({
          where: { user: { userId } },
          order: { createdAt: 'DESC' },
          relations: ['category', 'file'],
        }),
        this.newsRepository.find({
          where: { user: { userId } },
          order: { createdAt: 'DESC' },
          relations: ['file'],
          take: 5,
        }),
        this.announcementRepository.findOne({
          where: { userId },
          order: { postId: 'DESC' },
          relations: ['category'],
        }),
      ],
    );

    const [latestCommunityLikeCountMap, latestCommunityCommentCountMap] =
      await Promise.all([
        this.getLikeCountMap(
          LikeType.COMMUNITY,
          latestCommunity ? [latestCommunity.communityId] : [],
        ),
        this.getCommentCountMap(
          CommentTargetType.COMMUNITY,
          latestCommunity ? [latestCommunity.communityId] : [],
        ),
      ]);

    const [recentNewsLikeCountMap, recentNewsCommentCountMap] =
      await Promise.all([
        this.getLikeCountMap(
          LikeType.NEWS,
          recentNews.map((item) => item.newsId),
        ),
        this.getCommentCountMap(
          CommentTargetType.NEWS,
          recentNews.map((item) => item.newsId),
        ),
      ]);

    const latestAnnouncementLikeCountMap = await this.getLikeCountMap(
      LikeType.ANNOUNCEMENT,
      latestAnnouncement ? [latestAnnouncement.postId] : [],
    );

    const [communityThumbMap, newsThumbMap] = await Promise.all([
      this.buildCommunityThumbnailUrlMap(
        latestCommunity ? [latestCommunity] : [],
      ),
      this.buildNewsThumbnailUrlMap(recentNews),
    ]);

    return {
      latestCommunity: latestCommunity
        ? {
            communityId: latestCommunity.communityId,
            title: latestCommunity.title,
            category: latestCommunity.category?.name ?? null,
            createdAt: latestCommunity.createdAt,
            likeCount:
              latestCommunityLikeCountMap.get(latestCommunity.communityId) ?? 0,
            viewCount: Number(latestCommunity.viewCount ?? 0),
            commentCount:
              latestCommunityCommentCountMap.get(latestCommunity.communityId) ??
              0,
            thumbnailUrl:
              communityThumbMap.get(latestCommunity.communityId) ?? null,
          }
        : null,
      recentNews: recentNews.map((item: News) => ({
        newsId: item.newsId,
        title: item.title,
        place: item.place,
        createdAt: item.createdAt,
        likeCount: recentNewsLikeCountMap.get(item.newsId) ?? 0,
        viewCount: Number(item.viewCount ?? 0),
        commentCount: recentNewsCommentCountMap.get(item.newsId) ?? 0,
        thumbnailUrl: newsThumbMap.get(item.newsId) ?? null,
      })),
      latestAnnouncement: latestAnnouncement
        ? {
            postId: latestAnnouncement.postId,
            title: latestAnnouncement.title,
            category: latestAnnouncement.category?.name ?? null,
            scheduledAt: latestAnnouncement.scheduledAt,
            deadlineAt: latestAnnouncement.deadlineAt,
            priceType: latestAnnouncement.priceType,
            price: latestAnnouncement.price,
            likeCount:
              latestAnnouncementLikeCountMap.get(latestAnnouncement.postId) ??
              0,
            viewCount: 0,
            commentCount: 0,
          }
        : null,
    };
  }

  private async buildNewsThumbnailUrlMap(
    items: Pick<News, 'newsId' | 'file'>[],
  ): Promise<Map<string, string | null>> {
    const newsIds = items.map((item) => item.newsId);
    if (!newsIds.length) return new Map();

    const thumbMap = await this.fileService.getSmallestOrderThumbnailByTargetIds(
      FileTargetType.NEWS,
      newsIds,
    );

    return new Map(
      items.map((item) => [
        item.newsId,
        thumbMap.get(item.newsId)?.imgUrl ?? item.file?.imgUrl ?? null,
      ]),
    );
  }

  private async buildCommunityThumbnailUrlMap(
    items: Pick<Community, 'communityId' | 'file'>[],
  ): Promise<Map<string, string | null>> {
    const communityIds = items.map((item) => item.communityId);
    if (!communityIds.length) return new Map();

    const thumbMap = await this.fileService.getSmallestOrderThumbnailByTargetIds(
      FileTargetType.COMMUNITY,
      communityIds,
    );

    return new Map(
      items.map((item) => [
        item.communityId,
        thumbMap.get(item.communityId)?.imgUrl ?? item.file?.imgUrl ?? null,
      ]),
    );
  }

  private async getLikeCountMap(
    type: LikeType,
    targetIds: string[],
  ): Promise<Map<string, number>> {
    if (!targetIds.length) return new Map<string, number>();

    const rows = await this.likeRepository
      .createQueryBuilder('l')
      .select('l.targetId', 'targetId')
      .addSelect('COUNT(*)', 'count')
      .where('l.likeType = :type', { type })
      .andWhere('l.targetId IN (:...targetIds)', { targetIds })
      .groupBy('l.targetId')
      .getRawMany<{ targetId: string; count: string }>();

    return new Map<string, number>(
      rows.map((row) => [row.targetId, Number(row.count)]),
    );
  }

  private async getCommentCountMap(
    type: CommentTargetType,
    targetIds: string[],
  ): Promise<Map<string, number>> {
    if (!targetIds.length) return new Map<string, number>();

    const rows = await this.commentRepository
      .createQueryBuilder('c')
      .select('c.targetId', 'targetId')
      .addSelect('COUNT(*)', 'count')
      .where('c.targetType = :type', { type })
      .andWhere('c.targetId IN (:...targetIds)', { targetIds })
      .groupBy('c.targetId')
      .getRawMany<{ targetId: string; count: string }>();

    return new Map<string, number>(
      rows.map((row) => [row.targetId, Number(row.count)]),
    );
  }

  /**
   * 유저 목록 — 가입일(createdAt) 최신순, 무한스크롤.
   * majorIds 지정 시: 해당 전공 ID 중 하나에 매칭되는 유저만 (전공 미설정 유저는 제외).
   */
  async findList(query: ListUsersQueryDto): Promise<{
    items: Array<{
      userId: string;
      name: string | null;
      activityName: string;
      profileImgUrl: string;
      aboutMe: string | null;
      createdAt: Date;
      major: { majorId: string; name: string } | null;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 8;
    const likeQ = query.q ? toLikePattern(query.q) : null;
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.major', 'major')
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.userId', 'DESC')
      .take(limit + 1);

    if (query.majorIds) {
      const mids = query.majorIds
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m.length > 0);
      if (mids.length > 0) {
        qb.andWhere('major.majorId IN (:...mids)', { mids });
      }
    }

    if (query.cursor) {
      const { ca, uid } = decodeUserListCursor(query.cursor);
      qb.andWhere(
        '(user.createdAt < :ca OR (user.createdAt = :ca AND user.userId < :uid))',
        { ca: new Date(ca), uid },
      );
    }
    if (likeQ) {
      qb.andWhere(
        '(user.name LIKE :likeQ ESCAPE \'\\\\\' OR user.activityName LIKE :likeQ ESCAPE \'\\\\\' OR user.aboutMe LIKE :likeQ ESCAPE \'\\\\\')',
        { likeQ },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const items = slice.map((u) => ({
      userId: u.userId,
      name: u.name,
      activityName: u.activityName,
      profileImgUrl: u.profileImgUrl,
      aboutMe: u.aboutMe,
      createdAt: u.createdAt,
      major: u.major ? { majorId: u.major.majorId, name: u.major.name } : null,
    }));

    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeUserListCursor(last.createdAt, last.userId)
        : null;

    return { items, nextCursor, hasMore };
  }
}
