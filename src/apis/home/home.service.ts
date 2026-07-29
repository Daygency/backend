import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Announcement,
  AnnouncementStatus,
} from '../announcement/entities/announcement.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { CommunityCategory } from '../community/entities/community-category.entity';
import { Like, LikeType } from '../like/entities/like.entity';
import { Comment, CommentTargetType } from '../comment/entities/comment.entity';
import { FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { HomeBannerService } from '../home-banner/home-banner.service';

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
export class HomeService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(CommunityCategory)
    private readonly communityCategoryRepository: Repository<CommunityCategory>,
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly fileService: FileService,
    private readonly homeBannerService: HomeBannerService,
  ) {}

  async getHome() {
    const [latestAnnouncements, recentNews, categories, banners] =
      await Promise.all([
      this.announcementRepository.find({
        relations: ['category', 'user', 'majors'],
        order: { postId: 'DESC' },
        take: 3,
      }),
      this.newsRepository.find({
        relations: ['file'],
        order: { newsId: 'DESC' },
        take: 5,
      }),
      this.communityCategoryRepository.find({
        order: { name: 'ASC' },
      }),
      this.homeBannerService
        .findActivePublic({ limit: 20 })
        .then((res) => res.items),
    ]);

    const latestCommunityByCategoryRows = await Promise.all(
      categories.map(async (category) => {
        const post = await this.communityRepository.findOne({
          where: { category: { categoryId: category.categoryId } },
          relations: ['category'],
          order: { createdAt: 'DESC' },
        });

        return {
          categoryId: category.categoryId,
          categoryName: category.name,
          latestPost: post
            ? {
                communityId: post.communityId,
                title: post.title,
                viewCount: Number(post.viewCount ?? 0),
                createdAt: post.createdAt,
              }
            : null,
        };
      }),
    );

    const communityIds = latestCommunityByCategoryRows
      .map((row) => row.latestPost?.communityId)
      .filter((id): id is string => Boolean(id));

    const [likeCounts, commentCounts] = await Promise.all([
      communityIds.length
        ? this.likeRepository
            .createQueryBuilder('l')
            .select('l.targetId', 'targetId')
            .addSelect('COUNT(*)', 'count')
            .where('l.likeType = :likeType', { likeType: LikeType.COMMUNITY })
            .andWhere('l.targetId IN (:...communityIds)', { communityIds })
            .groupBy('l.targetId')
            .getRawMany<{ targetId: string; count: string }>()
        : Promise.resolve([]),
      communityIds.length
        ? this.commentRepository
            .createQueryBuilder('c')
            .select('c.targetId', 'targetId')
            .addSelect('COUNT(*)', 'count')
            .where('c.targetType = :targetType', {
              targetType: CommentTargetType.COMMUNITY,
            })
            .andWhere('c.targetId IN (:...communityIds)', { communityIds })
            .groupBy('c.targetId')
            .getRawMany<{ targetId: string; count: string }>()
        : Promise.resolve([]),
    ]);

    const likeCountMap = new Map(
      likeCounts.map((row) => [row.targetId, Number(row.count)]),
    );
    const commentCountMap = new Map(
      commentCounts.map((row) => [row.targetId, Number(row.count)]),
    );
    const newsIds = recentNews.map((item) => item.newsId);
    const newsThumbMap = await this.fileService.getSmallestOrderThumbnailByTargetIds(
      FileTargetType.NEWS,
      newsIds,
    );

    const latestCommunityByCategory = latestCommunityByCategoryRows.map(
      (row) => ({
        ...row,
        latestPost: row.latestPost
          ? {
              ...row.latestPost,
              likeCount: likeCountMap.get(row.latestPost.communityId) ?? 0,
              commentCount:
                commentCountMap.get(row.latestPost.communityId) ?? 0,
              viewCount: Number(row.latestPost.viewCount ?? 0),
            }
          : null,
      }),
    );

    return {
      banners,
      latestAnnouncements: latestAnnouncements.map((item) => ({
        postId: item.postId,
        title: item.title,
        type: item.category?.name ?? '기타',
        isRecruiting: item.status === AnnouncementStatus.OPEN,
        dDay: calcDDay(item.deadlineAt),
        priceType: item.priceType,
        price: item.price,
        viewCount: Number(item.viewCount ?? 0),
        address: item.address,
        deadlineAt: item.deadlineAt,
        createdAt: item.createdAt,
        user: item.user
          ? {
              activityName: item.user.activityName ?? null,
              profileImgUrl: item.user.profileImgUrl ?? null,
              name: item.user.name ?? null,
            }
          : null,
        ...(item.majors?.length
          ? {
              majorIds: item.majors.map((m) => m.majorId),
              majors: item.majors.map((m) => ({
                majorId: m.majorId,
                name: m.name,
              })),
            }
          : {}),
      })),
      recentNews: recentNews.map((item) => ({
        newsId: item.newsId,
        title: item.title,
        place: item.place,
        startedAt: item.startedAt,
        endedAt: item.endedAt ?? null,
        createdAt: item.createdAt,
        thumbnailUrl:
          newsThumbMap.get(item.newsId)?.imgUrl ?? item.file?.imgUrl ?? null,
      })),
      latestCommunityByCategory,
    };
  }
}
