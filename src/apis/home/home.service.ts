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
  ) {}

  async getHome() {
    const [latestAnnouncements, recentNews, categories] = await Promise.all([
      this.announcementRepository.find({
        relations: ['category'],
        order: { postId: 'DESC' },
        take: 3,
      }),
      this.newsRepository.find({
        order: { newsId: 'DESC' },
        take: 5,
      }),
      this.communityCategoryRepository.find({
        order: { name: 'ASC' },
      }),
    ]);

    const latestCommunityByCategory = await Promise.all(
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
              }
            : null,
        };
      }),
    );

    return {
      latestAnnouncements: latestAnnouncements.map((item) => ({
        postId: item.postId,
        title: item.title,
        type: item.category?.name ?? '기타',
        isRecruiting: item.status === AnnouncementStatus.OPEN,
        dDay: calcDDay(item.deadlineAt),
      })),
      recentNews: recentNews.map((item) => ({
        newsId: item.newsId,
        title: item.title,
        place: item.place,
        startedAt: item.startedAt,
      })),
      latestCommunityByCategory,
    };
  }
}
