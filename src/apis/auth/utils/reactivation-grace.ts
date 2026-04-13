import { SOFT_DELETE_RETENTION_DAYS } from '../../user/types/purge-soft-deleted.types';

/** `deletedAt` 이 유예 기간(일) 안이면 복구 확인(2단계) 대상이다. */
export function isWithinReactivationGrace(deletedAt: Date): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SOFT_DELETE_RETENTION_DAYS);
  return deletedAt >= cutoff;
}

/** 표시용 — 복구 마감으로 안내할 시각 (퍼지 기준과 동일한 유예 길이) */
export function computeReactivationDeadline(deletedAt: Date): Date {
  const d = new Date(deletedAt);
  d.setDate(d.getDate() + SOFT_DELETE_RETENTION_DAYS);
  return d;
}
