import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { Notice, NoticeTargetType } from './entities/notice.entity';
import { NoticeRecipient } from './entities/notice-recipient.entity';
import { UserPushDevice } from './entities/user-push-device.entity';
import { FcmService } from './fcm.service';

const PUSH_TITLE_BY_TARGET: Record<NoticeTargetType, string> = {
  [NoticeTargetType.COMMENT]: '댓글',
  [NoticeTargetType.FOLLOW]: '팔로우',
  [NoticeTargetType.APPLICATION]: '지원',
};

export interface CreateNoticePayload {
  actorUserId: string;
  targetType: NoticeTargetType;
  targetId: string;
  /** 인박스 표시 + FCM 알림 본문 */
  content?: string | null;
  recipientUserIds: string[];
}

function encodeNotificationCursor(
  createdAt: Date,
  recipientId: string,
): string {
  return Buffer.from(
    JSON.stringify({ t: createdAt.getTime(), i: recipientId }),
    'utf8',
  ).toString('base64url');
}

function decodeNotificationCursor(cursor: string): { t: number; i: string } {
  let raw: string;
  try {
    raw = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  let parsed: { t?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(raw) as { t?: unknown; i?: unknown };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  if (typeof parsed.t !== 'number' || typeof parsed.i !== 'string') {
    throw new BadRequestException('Invalid cursor');
  }
  return { t: parsed.t, i: parsed.i };
}

@Injectable()
export class NoticeService {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepo: Repository<Notice>,
    @InjectRepository(NoticeRecipient)
    private readonly recipientRepo: Repository<NoticeRecipient>,
    @InjectRepository(UserPushDevice)
    private readonly pushDeviceRepo: Repository<UserPushDevice>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly fcm: FcmService,
    private readonly dataSource: DataSource,
  ) {}

  async registerPushDevice(
    userId: string,
    dto: RegisterPushDeviceDto,
  ): Promise<void> {
    const existing = await this.pushDeviceRepo.findOne({
      where: { fcmToken: dto.fcmToken },
    });
    if (existing) {
      existing.user = { userId } as User;
      existing.platform = dto.platform ?? existing.platform;
      await this.pushDeviceRepo.save(existing);
      return;
    }
    await this.pushDeviceRepo.save(
      this.pushDeviceRepo.create({
        user: { userId } as User,
        fcmToken: dto.fcmToken,
        platform: dto.platform ?? null,
      }),
    );
  }

  async unregisterPushDevice(userId: string, fcmToken: string): Promise<void> {
    await this.pushDeviceRepo
      .createQueryBuilder()
      .delete()
      .where('fcm_token = :token AND user_id = :userId', {
        token: fcmToken,
        userId,
      })
      .execute();
  }

  async listInbox(userId: string, query: ListNotificationsQueryDto) {
    const limit = query.limit ?? 20;
    const qb = this.recipientRepo
      .createQueryBuilder('nr')
      .innerJoinAndSelect('nr.notice', 'n')
      .leftJoinAndSelect('n.actorUser', 'actor')
      .where('nr.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC')
      .addOrderBy('nr.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { t, i } = decodeNotificationCursor(query.cursor);
      const ca = new Date(t);
      qb.andWhere(
        '(n.created_at < :ca OR (n.created_at = :ca AND nr.id < :rid))',
        { ca, rid: i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeNotificationCursor(last.notice.createdAt, last.id)
        : null;

    return {
      items: slice.map((nr) => ({
        recipientId: nr.id,
        readAt: nr.readAt,
        notice: {
          id: nr.notice.id,
          targetType: nr.notice.targetType,
          targetId: nr.notice.targetId,
          content: nr.notice.content,
          createdAt: nr.notice.createdAt,
          actor: nr.notice.actorUser
            ? {
                userId: nr.notice.actorUser.userId,
                nickname: nr.notice.actorUser.nickname,
                activityName: nr.notice.actorUser.activityName,
                profileImgUrl: nr.notice.actorUser.profileImgUrl,
              }
            : null,
        },
      })),
      nextCursor,
    };
  }

  async markRecipientRead(userId: string, recipientId: string): Promise<void> {
    const nr = await this.recipientRepo.findOne({
      where: { id: recipientId },
      relations: { user: true },
    });
    if (!nr) {
      throw new NotFoundException('Notification recipient not found');
    }
    if (nr.user.userId !== userId) {
      throw new ForbiddenException();
    }
    if (!nr.readAt) {
      nr.readAt = new Date();
      await this.recipientRepo.save(nr);
    }
  }

  /**
   * 알림 row 생성 + 수신자 매핑 + (설정된 경우) FCM 전송.
   * 댓글/팔로우 등 다른 모듈에서 주입해 호출하면 됩니다.
   */
  async createAndDispatchPush(payload: CreateNoticePayload): Promise<Notice> {
    const recipients = [
      ...new Set(
        payload.recipientUserIds.filter((id) => id !== payload.actorUserId),
      ),
    ];

    const notice = await this.dataSource.transaction(async (em) => {
      const n = em.create(Notice, {
        actorUser: { userId: payload.actorUserId } as User,
        targetType: payload.targetType,
        targetId: payload.targetId,
        content: payload.content ?? null,
      });
      await em.save(n);
      if (recipients.length > 0) {
        await em.save(
          recipients.map((userId) =>
            em.create(NoticeRecipient, {
              notice: n,
              user: { userId } as User,
            }),
          ),
        );
      }
      return n;
    });

    if (recipients.length === 0 || !this.fcm.isEnabled()) {
      return notice;
    }

    const pushAllowed = await this.userRepo.find({
      where: {
        userId: In(recipients),
        isPushEnabled: true,
      },
      select: ['userId'],
    });
    const allowedIds = new Set(pushAllowed.map((u) => u.userId));
    const ids = [...allowedIds];
    const tokenRows = await this.pushDeviceRepo
      .createQueryBuilder('d')
      .select('d.fcm_token', 'fcmToken')
      .where('d.user_id IN (:...ids)', { ids })
      .getRawMany<{ fcmToken: string }>();
    const tokens = tokenRows.map((r) => r.fcmToken);
    const body = (payload.content ?? '').trim();
    const { failedTokens } = await this.fcm.sendMulticast({
      tokens,
      title: PUSH_TITLE_BY_TARGET[payload.targetType],
      body: body || PUSH_TITLE_BY_TARGET[payload.targetType],
      data: {
        noticeId: notice.id,
        targetType: payload.targetType,
        targetId: payload.targetId,
      },
    });
    if (failedTokens.length > 0) {
      await this.pushDeviceRepo.delete({ fcmToken: In(failedTokens) });
    }

    return notice;
  }
}
