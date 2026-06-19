/** 탈퇴(소프트 삭제) 후 물리 삭제까지 유예 기간(일). 스케줄러와 동일 값. */
export const SOFT_DELETE_RETENTION_DAYS = 7;

/**
 * `UserService.purgeSoftDeletedUsersOlderThanDays` 가 한 번 실행될 때의 결과.
 * HTTP API가 아니라 스케줄/관리용 반환 타입이다.
 */
export interface PurgeExpiredSoftDeletedUsersResult {
  /** 적용한 유예 일수 (예: 7) */
  retentionDays: number;
  /** 이 시각 **이전**에 소프트 삭제된 사용자만 물리 삭제 대상이 됨 (ISO 8601) */
  cutoffAt: string;
  /** 실제로 물리 삭제에 성공한 사용자 수 */
  purgedCount: number;
  /** 물리 삭제에 성공한 `userId` 목록 */
  purgedUserIds: string[];
}
