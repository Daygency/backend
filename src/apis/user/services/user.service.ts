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
        relations: ['category'],
      }),
      this.newsRepository.find({
        where: { user: { userId } },
        order: { createdAt: 'DESC' },
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

    return {
      community: communities.map((item: Community) => ({
        communityId: item.communityId,
        title: item.title,
        category: item.category?.name ?? null,
        createdAt: item.createdAt,
        likeCount: communityLikeCountMap.get(item.communityId) ?? 0,
        viewCount: Number(item.viewCount ?? 0),
        commentCount: communityCommentCountMap.get(item.communityId) ?? 0,
      })),
      news: news.map((item: News) => ({
        newsId: item.newsId,
        title: item.title,
        place: item.place,
        createdAt: item.createdAt,
        likeCount: newsLikeCountMap.get(item.newsId) ?? 0,
        viewCount: Number(item.viewCount ?? 0),
        commentCount: newsCommentCountMap.get(item.newsId) ?? 0,
      })),
      announcements: announcements.map((item: Announcement) => ({
        postId: item.postId,
        title: item.title,
        category: item.category?.name ?? null,
        scheduledAt: item.scheduledAt,
        deadlineAt: item.deadlineAt,
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
    });

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

    return news.map((item: News) => ({
      newsId: item.newsId,
      title: item.title,
      place: item.place,
      createdAt: item.createdAt,
      likeCount: newsLikeCountMap.get(item.newsId) ?? 0,
      viewCount: Number(item.viewCount ?? 0),
      commentCount: newsCommentCountMap.get(item.newsId) ?? 0,
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
          relations: ['category'],
        }),
        this.newsRepository.find({
          where: { user: { userId } },
          order: { createdAt: 'DESC' },
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
      })),
      latestAnnouncement: latestAnnouncement
        ? {
            postId: latestAnnouncement.postId,
            title: latestAnnouncement.title,
            category: latestAnnouncement.category?.name ?? null,
            scheduledAt: latestAnnouncement.scheduledAt,
            deadlineAt: latestAnnouncement.deadlineAt,
            likeCount:
              latestAnnouncementLikeCountMap.get(latestAnnouncement.postId) ??
              0,
            viewCount: 0,
            commentCount: 0,
          }
        : null,
    };
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
}
