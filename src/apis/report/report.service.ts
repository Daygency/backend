import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { Announcement } from '../announcement/entities/announcement.entity';
import { Block } from '../block/entities/block.entity';
import { ChatRoom, ChatRoomKind } from '../chat/entities/chat-room.entity';
import { ChatRoomMember } from '../chat/entities/chat-room-member.entity';
import { Comment, CommentTargetType } from '../comment/entities/comment.entity';
import { Community } from '../community/entities/community.entity';
import { News } from '../news/entities/news.entity';
import { Review } from '../review/entities/review.entity';
import { User, UserActivity } from '../user/entities/user.entity';
import {
  getReportCategoryLabelKo,
  getReportCategoryOptions,
} from './constants/report-categories';
import { getReportTargetTypeLabelKo } from './constants/report-target-types';
import {
  REPORT_AUTO_BAN_THRESHOLD,
} from './constants/report.constants';
import { CreateReportDto } from './dto/create-report.dto';
import { ListAdminReportsQueryDto } from './dto/list-admin-reports-query.dto';
import { Report, ReportTargetType } from './entities/report.entity';
import {
  addReportBanUntil,
  liftExpiredReportBanIfNeeded,
} from './utils/report-ban.util';

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
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomMember)
    private readonly chatRoomMemberRepository: Repository<ChatRoomMember>,
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
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

    const activeReportedUser = await liftExpiredReportBanIfNeeded(
      reportedUser,
      (u) => this.userRepository.save(u),
    );

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

    await this.assertTargetMatchesAuthor(
      reporterId,
      targetType,
      targetId,
      reportedUserId,
    );

    await this.reportRepository.save(
      this.reportRepository.create({
        reporterId,
        reportedUserId,
        category,
        targetType,
        targetId,
      }),
    );

    const strikeResetAt =
      activeReportedUser.reportStrikeResetAt ?? new Date(0);
    const strikeCount = await this.reportRepository.count({
      where: {
        reportedUserId,
        createdAt: MoreThanOrEqual(strikeResetAt),
      },
    });

    if (
      strikeCount >= REPORT_AUTO_BAN_THRESHOLD &&
      activeReportedUser.activity !== UserActivity.BAN
    ) {
      activeReportedUser.activity = UserActivity.BAN;
      activeReportedUser.reportBannedUntil = addReportBanUntil();
      await this.userRepository.save(activeReportedUser);
    }

    const totalReports = await this.reportRepository.count({
      where: { reportedUserId },
    });

    return {
      ok: true,
      reportedUserId,
      totalReportsAgainstUser: totalReports,
      strikeCountInPeriod: strikeCount,
    };
  }

  private async assertTargetMatchesAuthor(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    reportedUserId: string,
  ): Promise<void> {
    switch (targetType) {
      case ReportTargetType.CHAT: {
        const room = await this.chatRoomRepository.findOne({
          where: { id: targetId },
        });
        if (!room) {
          throw new NotFoundException('채팅방을 찾을 수 없습니다.');
        }
        const reporterMember = await this.chatRoomMemberRepository.findOne({
          where: {
            chatRoom: { id: targetId },
            user: { userId: reporterId },
          },
        });
        const reportedMember = await this.chatRoomMemberRepository.findOne({
          where: {
            chatRoom: { id: targetId },
            user: { userId: reportedUserId },
          },
        });
        if (!reporterMember) {
          throw new ForbiddenException('채팅방에 참여 중이 아닙니다.');
        }
        if (!reportedMember) {
          throw new BadRequestException(
            '신고 대상 사용자가 이 채팅방에 없습니다.',
          );
        }
        return;
      }
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
      case ReportTargetType.REVIEW: {
        const row = await this.reviewRepository.findOne({
          where: { id: targetId },
        });
        if (!row) {
          throw new NotFoundException('후기를 찾을 수 없습니다.');
        }
        if (row.reviewerUserId !== reportedUserId) {
          throw new BadRequestException(
            '신고 대상 사용자와 후기 작성자가 일치하지 않습니다.',
          );
        }
        return;
      }
    }
  }

  async listForAdmin(query: ListAdminReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [rows, total] = await this.reportRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.reporterId);
      userIds.add(row.reportedUserId);
    }

    const users =
      userIds.size > 0
        ? await this.userRepository.find({
            where: { userId: In([...userIds]) },
            select: ['userId', 'name', 'activityName', 'activity'],
          })
        : [];
    const userById = new Map(users.map((u) => [u.userId, u]));

    const targetSummaries = await this.resolveTargetSummaries(rows);

    return {
      items: rows.map((row) => {
        const reporter = userById.get(row.reporterId);
        const reported = userById.get(row.reportedUserId);
        const summaryKey = `${row.targetType}:${row.targetId}`;
        return {
          reportId: row.reportId,
          reporterId: row.reporterId,
          reporterName: reporter?.name ?? '(알 수 없음)',
          reporterActivityName: reporter?.activityName ?? '',
          reportedUserId: row.reportedUserId,
          reportedName: reported?.name ?? '(알 수 없음)',
          reportedActivityName: reported?.activityName ?? '',
          reportedActivity: reported?.activity ?? null,
          category: row.category,
          categoryLabelKo: getReportCategoryLabelKo(row.category),
          targetType: row.targetType,
          targetTypeLabelKo: getReportTargetTypeLabelKo(row.targetType),
          targetId: row.targetId,
          targetSummary:
            targetSummaries.get(summaryKey) ?? '(삭제됨 또는 확인 불가)',
          createdAt: row.createdAt,
        };
      }),
      total,
      page,
      limit,
    };
  }

  private truncateText(text: string | null | undefined, max = 80): string {
    const t = text?.trim() ?? '';
    if (!t) return '(내용 없음)';
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }

  private async resolveTargetSummaries(
    reports: Report[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (reports.length === 0) return result;

    const idsByType = new Map<ReportTargetType, Set<string>>();
    for (const row of reports) {
      const set = idsByType.get(row.targetType) ?? new Set<string>();
      set.add(row.targetId);
      idsByType.set(row.targetType, set);
    }

    const communityIds = [...(idsByType.get(ReportTargetType.COMMUNITY) ?? [])];
    if (communityIds.length) {
      const rows = await this.communityRepository.find({
        where: { communityId: In(communityIds) },
        select: ['communityId', 'title'],
      });
      for (const row of rows) {
        result.set(
          `${ReportTargetType.COMMUNITY}:${row.communityId}`,
          this.truncateText(row.title),
        );
      }
    }

    const newsIds = [...(idsByType.get(ReportTargetType.NEWS) ?? [])];
    if (newsIds.length) {
      const rows = await this.newsRepository.find({
        where: { newsId: In(newsIds) },
        select: ['newsId', 'title'],
      });
      for (const row of rows) {
        result.set(
          `${ReportTargetType.NEWS}:${row.newsId}`,
          this.truncateText(row.title),
        );
      }
    }

    const announcementIds = [
      ...(idsByType.get(ReportTargetType.ANNOUNCEMENT) ?? []),
    ];
    if (announcementIds.length) {
      const rows = await this.announcementRepository.find({
        where: { postId: In(announcementIds) },
        select: ['postId', 'title'],
      });
      for (const row of rows) {
        result.set(
          `${ReportTargetType.ANNOUNCEMENT}:${row.postId}`,
          this.truncateText(row.title),
        );
      }
    }

    const commentIds = [...(idsByType.get(ReportTargetType.COMMENT) ?? [])];
    if (commentIds.length) {
      const rows = await this.commentRepository.find({
        where: { id: In(commentIds) },
        select: ['id', 'content', 'targetType'],
      });
      for (const row of rows) {
        const parentLabel =
          row.targetType === CommentTargetType.NEWS ? '공연소식' : '커뮤니티';
        result.set(
          `${ReportTargetType.COMMENT}:${row.id}`,
          `${this.truncateText(row.content, 60)} (${parentLabel} 댓글)`,
        );
      }
    }

    const chatIds = [...(idsByType.get(ReportTargetType.CHAT) ?? [])];
    if (chatIds.length) {
      const rows = await this.chatRoomRepository.find({
        where: { id: In(chatIds) },
        relations: { announcement: true },
      });
      for (const row of rows) {
        if (row.kind === ChatRoomKind.ANNOUNCEMENT && row.announcement?.title) {
          result.set(
            `${ReportTargetType.CHAT}:${row.id}`,
            `모집공고 채팅 · ${this.truncateText(row.announcement.title, 60)}`,
          );
        } else if (row.kind === ChatRoomKind.COFFEE) {
          result.set(`${ReportTargetType.CHAT}:${row.id}`, '커피챗');
        } else {
          result.set(`${ReportTargetType.CHAT}:${row.id}`, '채팅방');
        }
      }
    }

    const reviewIds = [...(idsByType.get(ReportTargetType.REVIEW) ?? [])];
    if (reviewIds.length) {
      const rows = await this.reviewRepository.find({
        where: { id: In(reviewIds) },
        relations: ['announcement'],
      });
      for (const row of rows) {
        const title = row.announcement?.title?.trim();
        result.set(
          `${ReportTargetType.REVIEW}:${row.id}`,
          title
            ? `활동 후기 · ${this.truncateText(title, 60)}`
            : '활동 후기',
        );
      }
    }

    return result;
  }
}
