/**
 * 탈퇴(소프트 삭제) 후 유예 기간 안 — 복구 확인 전 1차 로그인 응답.
 * JWT·user(로그인 완료)는 포함하지 않는다.
 */
export interface NeedsReactivationLoginResponse {
  needsReactivation: true;
  /** 탈퇴 처리 시각 (ISO 8601) */
  deletedAt: string;
  /** 복구 가능 마감 시각(대략 `deletedAt` + 유예 일수, ISO 8601) */
  reactivationDeadline: string;
  /** 소셜 프로필 (표시용) */
  profile: {
    socialId: string;
    nickname: string;
    email: string;
    profileImgUrl: string;
  };
  /** DB에 저장된 표시용 필드 */
  user: {
    userId: string;
    nickname: string;
    activityName: string;
    profileImgUrl: string;
  };
}
