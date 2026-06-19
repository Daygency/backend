import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from '../announcement/entities/announcement.entity';
import { Block } from '../block/entities/block.entity';
import { Comment } from '../comment/entities/comment.entity';
import { Community } from '../community/entities/community.entity';
import { News } from '../news/entities/news.entity';
import { User, UserActivity } from '../user/entities/user.entity';
import { getReportCategoryOptions } from './constants/report-categories';
import { REPORT_LIMIT } from './constants/report.constants';
import { CreateReportDto } from './dto/create-report.dto';
import { Report, ReportTargetType } from './entities/report.entity';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Block)
    private readonly blockRepository: Repository<Block>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
  ) {}

  getReportCategories() {
    return { categories: getReportCategoryOptions() };
  }

  async create(reporterId: string, dto: CreateReportDto) {
    const { reportedUserId, category, targetType, targetId } = dto;

    if (reporterId === reportedUserId) {
      throw new BadRequestException('자기 자신을 신고할 수 없습니다.');
    }

    const reportedUser = await this.userRepository.findOne({
      where: { userId: reportedUserId },
    });
    if (!reportedUser) {
      throw new NotFoundException('신고 대상 사용자를 찾을 수 없습니다.');
    }

    const blockedByReporter = await this.blockRepository.findOne({
      where: { blockerId: reporterId, blockedId: reportedUserId },
    });
    const blockedReporter = await this.blockRepository.findOne({
      where: { blockerId: reportedUserId, blockedId: reporterId },
    });
    if (blockedByReporter || blockedReporter) {
      throw new ForbiddenException(
        '차단 관계에 있는 사용자는 신고할 수 없습니다.',
      );
    }

    const existing = await this.reportRepository.findOne({
      where: { reporterId, reportedUserId },
    });
    if (existing) {
      throw new ConflictException('이미 신고한 사용자입니다.');
    }

    await this.assertTargetMatchesAuthor(targetType, targetId, reportedUserId);

    await this.reportRepository.save(
      this.reportRepository.create({
        reporterId,
        reportedUserId,
        category,
        targetType,
        targetId,
      }),
    );

    const totalReports = await this.reportRepository.count({
      where: { reportedUserId },
    });

    if (
      totalReports > REPORT_LIMIT &&
      reportedUser.activity === UserActivity.NORMAL
    ) {
      reportedUser.activity = UserActivity.FLAGGED;
      await this.userRepository.save(reportedUser);
    }

    return {
      ok: true,
      reportedUserId,
      totalReportsAgainstUser: totalReports,
    };
  }

  private async assertTargetMatchesAuthor(
    targetType: ReportTargetType,
    targetId: string,
    reportedUserId: string,
  ): Promise<void> {
    switch (targetType) {
      case ReportTargetType.COMMUNITY: {
        const row = await this.communityRepository.findOne({
          where: { communityId: targetId },
          relations: ['user'],
        });
        if (!row?.user) {
          throw new NotFoundException('커뮤니티 글을 찾을 수 없습니다.');
        }
        if (row.user.userId !== reportedUserId) {
          throw new BadRequestException(
            '신고 대상 사용자와 글 작성자가 일치하지 않습니다.',
          );
        }
        return;
      }
      case ReportTargetType.NEWS: {
        const row = await this.newsRepository.findOne({
          where: { newsId: targetId },
          relations: ['user'],
        });
        if (!row?.user) {
          throw new NotFoundException('공연 소식 글을 찾을 수 없습니다.');
        }
        if (row.user.userId !== reportedUserId) {
          throw new BadRequestException(
            '신고 대상 사용자와 글 작성자가 일치하지 않습니다.',
          );
        }
        return;
      }
      case ReportTargetType.COMMENT: {
        const row = await this.commentRepository.findOne({
          where: { id: targetId },
          relations: ['user'],
        });
        if (!row?.user) {
          throw new NotFoundException('댓글을 찾을 수 없습니다.');
        }
        if (row.user.userId !== reportedUserId) {
          throw new BadRequestException(
            '신고 대상 사용자와 댓글 작성자가 일치하지 않습니다.',
          );
        }
        return;
      }
      case ReportTargetType.ANNOUNCEMENT: {
        const row = await this.announcementRepository.findOne({
          where: { postId: targetId },
          relations: ['user'],
        });
        if (!row?.user) {
          throw new NotFoundException('모집 공고를 찾을 수 없습니다.');
        }
        if (row.user.userId !== reportedUserId) {
          throw new BadRequestException(
            '신고 대상 사용자와 공고 작성자가 일치하지 않습니다.',
          );
        }
        return;
      }
    }
  }
}
