import { User, UserActivity } from '../../user/entities/user.entity';
import { REPORT_BAN_DAYS } from '../constants/report.constants';

/** 신고 자동 정지 만료 시 계정 복구 + 신고 카운트 초기화 */
export async function liftExpiredReportBanIfNeeded(
  user: User,
  save: (u: User) => Promise<User>,
): Promise<User> {
  if (user.activity !== UserActivity.BAN || !user.reportBannedUntil) {
    return user;
  }
  if (new Date() < user.reportBannedUntil) {
    return user;
  }
  user.activity = UserActivity.NORMAL;
  user.reportBannedUntil = null;
  user.reportStrikeResetAt = new Date();
  return save(user);
}

export function addReportBanUntil(from = new Date()): Date {
  const until = new Date(from);
  until.setDate(until.getDate() + REPORT_BAN_DAYS);
  return until;
}
