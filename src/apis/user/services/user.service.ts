import type { Express } from 'express';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { User, SocialProvider, UserRole } from '../entities/user.entity';
import type { SocialProfile } from '../../auth/types/social-profile.type';
import { ProfileResponseDto } from '../dto/profile-response.dto';
import { PublicProfileResponseDto } from '../dto/public-profile-response.dto';
import {
  UpdateAwardDto,
  UpdateCareerDto,
  UpdateEducationDto,
  UpdateUserDto,
} from '../dto/update-user.dto';
import { Education } from '../entities/education.entity';
import { Career } from '../entities/career.entity';
import { Major } from '../../major/entities/major.entity';
import { Award } from '../entities/award.entity';
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
import { Follow } from '../../follow/entities/follow.entity';
import { FileService } from '../../file/file.service';
import { FileTargetType } from '../../file/entities/file.entity';
import { UserPushDevice } from '../../notice/entities/user-push-device.entity';
import { hardDeleteUserCascade } from '../utils/user-hard-delete-cascade';
import type { PurgeExpiredSoftDeletedUsersResult } from '../types/purge-soft-deleted.types';

function encodeUserListCursor(createdAt: Date, userId: string): string {
  return Buffer.from(
    JSON.stringify({ ca: createdAt.toISOString(), uid: userId }),
    'utf8',
  ).toString('base64url');
}

function decodeUserListCursor(cursor: string): { ca: string; uid: string } {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const o = JSON.parse(raw) as { ca?: string; uid?: string };
    if (!o?.ca || !o?.uid) throw new Error('invalid');
    return { ca: o.ca, uid: o.uid };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor입니다.');
  }
}

function calcDDay(deadlineAt: Date): string {
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
    if (String(user.socialId).trim() !== String(socialId).trim()) {
      this.logger.warn(
        `socialId mismatch on placeholder row userId=${user.userId}, normalizing`,
      );
      user.socialId = socialId;
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

  async createBySocial(
    provider: SocialProvider,
    profile: SocialProfile,
    options: { nickname?: string; activityName: string; role?: UserRole },
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
      role: this.coerceUserRole(options.role),
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

    const [followingCount, followerCount] = await Promise.all([
      this.followRepository.count({ where: { senderId: userId } }),
      this.followRepository.count({ where: { receiverId: userId } }),
    ]);

    return {
      userId: user.userId,
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
      followingCount,
      followerCount,
    };
  }

  /**
   * 타인 프로필(포트폴리오) — 내 프로필 조회와 동일 필드, 연락처 제외
   */
  async getPublicProfile(userId: string): Promise<PublicProfileResponseDto> {
    const user = await this.userRepository.findOne({
      where: { userId },
      relations: ['educations', 'careers', 'awards', 'major'],
      select: [
        'userId',
        'profileImgUrl',
        'activityName',
        'nickname',
        'role',
        'aboutMe',
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
      nickname: user.nickname,
      activityName: user.activityName,
      role: user.role,
      aboutMe: user.aboutMe,
      selfIntroduction: user.selfIntroduction,
      educations: user.educations ?? null,
      careers: user.careers ?? null,
      awards: user.awards ?? null,
      major: user.major ?? null,
      followingCount,
      followerCount,
    };
  }

  async updateMyProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
    profileImage?: Express.Multer.File,
  ) {
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
      const endedAt =
        dto.endedAt != null && dto.endedAt !== ''
          ? new Date(dto.endedAt)
          : null;
      if (dto.educationId && existingMap.has(dto.educationId)) {
        const entity = existingMap.get(dto.educationId) as Education;
        entity.description = dto.description;
        entity.startedAt = new Date(dto.startedAt);
        entity.endedAt = endedAt;
        toSave.push(entity);
      } else {
        const entity = this.educationRepository.create({
          description: dto.description,
          startedAt: new Date(dto.startedAt),
          endedAt,
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
      const organization = dto.organization?.trim()
        ? dto.organization.trim().slice(0, 10)
        : null;
      if (dto.careerId && existingMap.has(dto.careerId)) {
        const entity = existingMap.get(dto.careerId) as Career;
        entity.description = dto.description;
        entity.startedAt = new Date(dto.startedAt);
        entity.endedAt = new Date(dto.endedAt);
        entity.organization = organization;
        toSave.push(entity);
      } else {
        const entity = this.careerRepository.create({
          description: dto.description,
          startedAt: new Date(dto.startedAt),
          endedAt: new Date(dto.endedAt),
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

  async getMyWrittenPosts(userId: string) {
    const [communities, news, announcements] = await Promise.all([
      this.communityRepository.find({
        where: { user: { userId } },
        order: { createdAt: 'DESC' },
        relations: ['category', 'file'],
      }),
      this.newsRepository.find({
        where: { user: { userId } },
        order: { createdAt: 'DESC' },
        relations: ['file'],
      }),
      this.announcementRepository.find({
        where: { userId },
        order: { postId: 'DESC' },
        relations: ['category'],
      }),
    ]);

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

    return {
      community: communities.map((item: Community) => ({
        communityId: item.communityId,
        title: item.title,
        category: item.category?.name ?? null,
        createdAt: item.createdAt,
        likeCount: communityLikeCountMap.get(item.communityId) ?? 0,
        viewCount: Number(item.viewCount ?? 0),
        commentCount: communityCommentCountMap.get(item.communityId) ?? 0,
        thumbnailUrl: communityThumbMap.get(item.communityId) ?? null,
      })),
      news: news.map((item: News) => ({
        newsId: item.newsId,
        title: item.title,
        place: item.place,
        createdAt: item.createdAt,
        likeCount: newsLikeCountMap.get(item.newsId) ?? 0,
        viewCount: Number(item.viewCount ?? 0),
        commentCount: newsCommentCountMap.get(item.newsId) ?? 0,
        thumbnailUrl: newsThumbMap.get(item.newsId) ?? null,
      })),
      announcements: announcements.map((item: Announcement) => ({
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
    };
  }

  async getMyNewsPosts(userId: string) {
    const news = await this.newsRepository.find({
      where: { user: { userId } },
      order: { createdAt: 'DESC' },
      relations: ['file'],
    });

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

    return news.map((item: News) => ({
      newsId: item.newsId,
      title: item.title,
      place: item.place,
      createdAt: item.createdAt,
      likeCount: newsLikeCountMap.get(item.newsId) ?? 0,
      viewCount: Number(item.viewCount ?? 0),
      commentCount: newsCommentCountMap.get(item.newsId) ?? 0,
      thumbnailUrl: newsThumbMap.get(item.newsId) ?? null,
    }));
  }

  async getMyCommentPosts(userId: string) {
    const comments = await this.commentRepository.find({
      where: { user: { userId } },
      order: { createdAt: 'DESC' },
    });

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

    return comments.map((comment) => ({
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
  }

  async getMyAnnouncementPosts(userId: string) {
    const announcements = await this.announcementRepository.find({
      where: { userId },
      order: { postId: 'DESC' },
      relations: ['category'],
    });

    const announcementLikeCountMap = await this.getLikeCountMap(
      LikeType.ANNOUNCEMENT,
      announcements.map((item) => item.postId),
    );

    return announcements.map((item: Announcement) => ({
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
  }

  async getMyScrappedAnnouncementPosts(
    userId: string,
    query: ListMyScrapQueryDto,
  ) {
    const { cursor, limit = 20 } = query;

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
    const { cursor, limit = 20 } = query;

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
    const { cursor, limit = 20 } = query;

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
      nickname: string;
      activityName: string;
      profileImgUrl: string;
      aboutMe: string | null;
      createdAt: Date;
      major: { majorId: string; name: string } | null;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 20;
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

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const items = slice.map((u) => ({
      userId: u.userId,
      nickname: u.nickname,
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
