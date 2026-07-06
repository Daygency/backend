import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { LikeType } from '../like/entities/like.entity';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { SendAdminNotificationDto } from './dto/send-admin-notification.dto';
import { Notice, NoticeTargetType } from './entities/notice.entity';
import { NoticeRecipient } from './entities/notice-recipient.entity';
import { UserPushDevice } from './entities/user-push-device.entity';
import { FcmService } from './fcm.service';

const PUSH_TITLE_BY_TARGET: Record<NoticeTargetType, string> = {
  [NoticeTargetType.COMMENT]: '댓글',
  [NoticeTargetType.FOLLOW]: '팔로우',
  [NoticeTargetType.APPLICATION]: '지원',
  [NoticeTargetType.LIKE]: '좋아요',
  [NoticeTargetType.REVIEW]: '활동 후기',
  [NoticeTargetType.INQUIRY]: '고객센터',
  [NoticeTargetType.ANNOUNCEMENT]: '공지',
};

export interface CreateNoticePayload {
  actorUserId: string;
  targetType: NoticeTargetType;
  targetId: string;
  /** `targetType === LIKE` 일 때 좋아요 대상 구분 */
  likeKind?: LikeType | null;
  /** 인박스 표시 + FCM 알림 본문 */
  content?: string | null;
  recipientUserIds: string[];
  /** true면 DB 알림만 저장하고 FCM은 보내지 않음 */
  skipPush?: boolean;
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
  private readonly logger = new Logger(NoticeService.name);

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

  /** 실제 알림(댓글/팔로우 등) 발송 대상 여부. 기기 등록/OS 권한과 무관. */
  async getPushEnabled(userId: string): Promise<{ isPushEnabled: boolean }> {
    const user = await this.userRepo.findOne({
      where: { userId },
      select: { isPushEnabled: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { isPushEnabled: user.isPushEnabled };
  }

  async setPushEnabled(userId: string, isPushEnabled: boolean): Promise<void> {
    await this.userRepo.update({ userId }, { isPushEnabled });
  }

  async listInbox(userId: string, query: ListNotificationsQueryDto) {
    const limit = query.limit ?? 20;
    const qb = this.recipientRepo
      .createQueryBuilder('nr')
      .innerJoinAndSelect('nr.notice', 'n')
      .leftJoinAndSelect('n.actorUser', 'actor')
      .where('nr.user_id = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
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
          likeKind: nr.notice.likeKind,
          content: nr.notice.content,
          createdAt: nr.notice.createdAt,
          actor: nr.notice.actorUser
            ? {
                userId: nr.notice.actorUser.userId,
                name: nr.notice.actorUser.name,
                activityName: nr.notice.actorUser.activityName,
                profileImgUrl: nr.notice.actorUser.profileImgUrl,
              }
            : null,
        },
      })),
      nextCursor,
      hasMore,
    };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.recipientRepo
      .createQueryBuilder('nr')
      .where('nr.user_id = :userId', { userId })
      .andWhere('nr.read_at IS NULL')
      .getCount();
    return { unreadCount };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.recipientRepo
      .createQueryBuilder()
      .update(NoticeRecipient)
      .set({ readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();
    return { updated: result.affected ?? 0 };
  }

  /**
   * 현재 로그인 유저에게 등록된 모든 FCM 토큰으로 테스트 푸시.
   * `isPushEnabled`와 무관하게 전송(연동 검증용).
   */
  async sendTestPushToSelf(userId: string): Promise<{
    tokenCount: number;
    successCount: number;
    failureCount: number;
    failedTokens: string[];
  }> {
    if (!this.fcm.isEnabled()) {
      throw new ServiceUnavailableException(
        'FCM is not configured (check service account env / JSON file).',
      );
    }
    const devices = await this.pushDeviceRepo.find({
      where: { user: { userId } },
      select: { fcmToken: true },
    });
    const tokens = devices.map((d) => d.fcmToken);
    if (tokens.length === 0) {
      throw new BadRequestException(
        '등록된 FCM 토큰이 없습니다. 앱에서 POST /notifications/devices 로 토큰을 등록하세요.',
      );
    }
    const { failedTokens, successCount, failureCount, firstFailureMessage } =
      await this.fcm.sendMulticast({
        tokens,
        title: 'Daygency 푸시 테스트',
        body: '테스트 알림이 도착했습니다.',
        data: {
          test: 'true',
          targetType: 'TEST',
          targetId: userId,
        },
      });
    if (failedTokens.length > 0) {
      await this.pushDeviceRepo.delete({ fcmToken: In(failedTokens) });
    }
    if (successCount === 0) {
      throw new ServiceUnavailableException(
        firstFailureMessage ??
          'FCM 전송에 실패했습니다. Google Cloud에서 Firebase Cloud Messaging API 사용 설정, 서비스 계정 키(Firebase 프로젝트와 동일)를 확인하세요.',
      );
    }
    return {
      tokenCount: tokens.length,
      successCount,
      failureCount,
      failedTokens,
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
  async createAndDispatchPush(
    payload: CreateNoticePayload,
  ): Promise<Notice | null> {
    const recipients = [
      ...new Set(
        payload.recipientUserIds.filter((id) => id !== payload.actorUserId),
      ),
    ];
    if (recipients.length === 0) {
      return null;
    }

    const notice = await this.dataSource.transaction(async (em) => {
      const n = em.create(Notice, {
        actorUser: { userId: payload.actorUserId } as User,
        targetType: payload.targetType,
        targetId: payload.targetId,
        likeKind:
          payload.targetType === NoticeTargetType.LIKE
            ? (payload.likeKind ?? null)
            : null,
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

    if (payload.skipPush || !this.fcm.isEnabled()) {
      return notice;
    }

    try {
      const pushAllowed = await this.userRepo.find({
        where: {
          userId: In(recipients),
          isPushEnabled: true,
        },
        select: ['userId'],
      });
      const allowedIds = new Set(pushAllowed.map((u) => u.userId));
      const ids = [...allowedIds];
      const pushDevices =
        ids.length > 0
          ? await this.pushDeviceRepo.find({
              where: { user: { userId: In(ids) } },
              select: { fcmToken: true },
            })
          : [];
      const tokens = pushDevices.map((d) => d.fcmToken);
      const body = (payload.content ?? '').trim();
      const data: Record<string, string> = {
        noticeId: notice.id,
        targetType: payload.targetType,
        targetId: payload.targetId,
      };
      if (payload.likeKind) {
        data.likeKind = payload.likeKind;
      }
      const { failedTokens } = await this.fcm.sendMulticast({
        tokens,
        title: PUSH_TITLE_BY_TARGET[payload.targetType],
        body: body || PUSH_TITLE_BY_TARGET[payload.targetType],
        data,
      });
      if (failedTokens.length > 0) {
        await this.pushDeviceRepo.delete({ fcmToken: In(failedTokens) });
      }
    } catch (e) {
      this.logger.error('FCM send failed (notice was saved)', e);
    }

    return notice;
  }

  /**
   * 관리자 전체 공지 발송. `isPushEnabled` 여부와 무관하게
   * 등록된 모든 FCM 토큰으로 발송한다.
   */
  async sendAdminBroadcast(
    adminUserId: string,
    dto: SendAdminNotificationDto,
  ): Promise<{
    recipientCount: number;
    tokenCount: number;
    successCount: number;
    failureCount: number;
  }> {
    const users = await this.userRepo.find({ select: { userId: true } });
    const recipients = users
      .map((u) => u.userId)
      .filter((id) => id !== adminUserId);

    if (recipients.length === 0) {
      return {
        recipientCount: 0,
        tokenCount: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const notice = await this.dataSource.transaction(async (em) => {
      const n = em.create(Notice, {
        actorUser: { userId: adminUserId } as User,
        targetType: NoticeTargetType.ANNOUNCEMENT,
        targetId: adminUserId,
        title: dto.title,
        content: dto.body,
      });
      await em.save(n);
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
        const chunk = recipients.slice(i, i + CHUNK_SIZE);
        await em.save(
          chunk.map((userId) =>
            em.create(NoticeRecipient, {
              notice: n,
              user: { userId } as User,
            }),
          ),
        );
      }
      return n;
    });

    if (!this.fcm.isEnabled()) {
      return {
        recipientCount: recipients.length,
        tokenCount: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const devices = await this.pushDeviceRepo.find({
      where: { user: { userId: In(recipients) } },
      select: { fcmToken: true },
    });
    const tokens = devices.map((d) => d.fcmToken);
    const { failedTokens, successCount, failureCount } =
      await this.fcm.sendMulticast({
        tokens,
        title: dto.title,
        body: dto.body,
        data: {
          noticeId: notice.id,
          targetType: NoticeTargetType.ANNOUNCEMENT,
          targetId: notice.targetId,
        },
      });
    if (failedTokens.length > 0) {
      await this.pushDeviceRepo.delete({ fcmToken: In(failedTokens) });
    }

    return {
      recipientCount: recipients.length,
      tokenCount: tokens.length,
      successCount,
      failureCount,
    };
  }
}
