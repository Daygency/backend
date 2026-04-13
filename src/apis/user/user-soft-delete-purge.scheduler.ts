import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserService } from './services/user.service';
import { SOFT_DELETE_RETENTION_DAYS } from './types/purge-soft-deleted.types';

@Injectable()
export class UserSoftDeletePurgeScheduler {
  private readonly logger = new Logger(UserSoftDeletePurgeScheduler.name);

  constructor(private readonly userService: UserService) {}

  /** 매일 00:00(서버 로컬 타임존) — `deleted_at` 이 유예 기간보다 오래된 사용자 물리 삭제 */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredSoftDeletedUsers(): Promise<void> {
    const result = await this.userService.purgeSoftDeletedUsersOlderThanDays(
      SOFT_DELETE_RETENTION_DAYS,
    );
    this.logger.log(
      `soft-delete purge: retentionDays=${result.retentionDays} purgedCount=${result.purgedCount} cutoffAt=${result.cutoffAt}`,
    );
  }
}
