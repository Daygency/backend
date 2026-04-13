# 사용자 · 계정 삭제 명세

## 1. 구현 요약

| 항목 | 상태 |
|------|------|
| **본인 탈퇴 HTTP API** | `DELETE /users/me` — 소프트 삭제 + FCM 기기 행 삭제 |
| **사용자 행** | `user.deleted_at` (`User` `@DeleteDateColumn`) |
| **탈퇴 후 Access JWT** | `JwtAccessStrategy`에서 활성 사용자만 통과 — 탈퇴 직후 남은 액세스 토큰도 **401** |
| **탈퇴 후 Refresh JWT** | `AuthService.refreshTokens` → `findOne`이 탈퇴 사용자 제외 → **401** |
| **동일 소셜 재로그인** | 유예 기간 내: 1차 `needsReactivation` → 2차 `confirmReactivation: true` 시 `reactivateUser` + JWT ([인증 API](../auth/README.md)) |
| **유예 후 자동 영구 삭제** | 탈퇴일(`deleted_at`)로부터 **7일**이 지난 사용자 — 매일 00:00(서버 로컬) 스케줄에서 **물리 삭제** |

---

## 2. `DELETE /users/me`

**목적:** 로그인한 사용자 본인 계정을 **소프트 삭제**한다.

**인증:** `Authorization: Bearer <access_token>` (필수)

### 요청 · 응답 타입 (TypeScript)

탈퇴 API는 **요청 본문이 없고**, 성공 시 **응답 본문도 없다** (`204 No Content`).

```typescript
/** JSON 본문 없음. `Content-Type` 불필요. */
type DeleteMyAccountRequestBody = undefined;

/**
 * 성공 시 HTTP **204 No Content**.
 * Nest/Swagger 상으로는 본문이 없으므로 타입은 `void` 로 둔다.
 */
type DeleteMyAccountResponseBody = void;
```

### HTTP 상태

| 상태 | 설명 |
|------|------|
| **204** | 탈퇴 처리 완료 — **응답 바디 없음** |
| **401** | 비로그인·토큰 무효·이미 탈퇴 처리된 사용자(액세스 검증 실패) |
| **404** | 사용자 행 없음(비정상) |

에러 응답 본문 형식은 전역 예외 필터 설정에 따른다(프로젝트 공통).

**서버 동작:**

1. 트랜잭션 안에서 `user_push_device`에서 해당 `user_id` 행 **물리 삭제**
2. `user`에 **소프트 삭제** (`softDelete`)

---

## 3. 유예 기간 후 자동 물리 삭제 (스케줄)

유예 기간 안에 **같은 소셜로 로그인**하면, 먼저 **`needsReactivation: true`** 만 내려가고 JWT는 주지 않는다. 사용자가 복구에 동의한 뒤 **같은 엔드포인트에 `confirmReactivation: true`** 를 넣어 다시 호출하면 `reactivateUser` 후 JWT가 발급된다.  
**`deleted_at` 이 설정된 시각으로부터 7일이 지나면** 스케줄이 해당 사용자를 **물리 삭제**한다. 그 이후에는 동일 소셜로는 **신규 가입**만 가능하다.

- **유예 일수:** `SOFT_DELETE_RETENTION_DAYS` = **7** (`src/apis/user/types/purge-soft-deleted.types.ts`)
- **실행 시각:** 매일 **00:00** — 서버 프로세스의 **로컬 타임존** 기준 (`CronExpression.EVERY_DAY_AT_MIDNIGHT`)
- **HTTP API 아님** — 백그라운드 스케줄만 존재한다.

### 스케줄 결과 타입 (TypeScript)

`UserService.purgeSoftDeletedUsersOlderThanDays` 및 스케줄러가 사용하는 반환 형태다.

```typescript
/** 탈퇴(소프트 삭제) 후 물리 삭제까지 유예 기간(일). */
export const SOFT_DELETE_RETENTION_DAYS = 7;

/** 스케줄/관리용 — HTTP 응답이 아님 */
export interface PurgeExpiredSoftDeletedUsersResult {
  /** 적용한 유예 일수 (예: 7) */
  retentionDays: number;
  /** 이 시각 *이전*에 소프트 삭제된 사용자만 물리 삭제 대상 (ISO 8601) */
  cutoffAt: string;
  /** 실제로 물리 삭제에 성공한 사용자 수 */
  purgedCount: number;
  /** 물리 삭제에 성공한 `userId` 목록 */
  purgedUserIds: string[];
}
```

개별 사용자 삭제 중 오류가 나면 해당 `userId`는 건너뛰고 로그만 남기며, 나머지는 계속 처리한다.

---

## 4. 데이터 모델 · 복구 (참고)

- **`User.deletedAt`**: TypeORM 소프트 삭제.
- **`UserService.reactivateUser(userId)`**: `restore` — 소셜 재로그인 시 사용.
- **`UserService.deleteMyAccount(userId)`**: 탈퇴 처리.
- **`UserService.purgeSoftDeletedUsersOlderThanDays(retentionDays)`**: 유예가 지난 소프트 삭제 사용자 **물리 삭제** (자식 테이블 정리 후 `user` 행 삭제).

---

## 5. 소셜 재로그인 시 “복구”

탈퇴(소프트 삭제)된 계정이 **같은 소셜 provider + socialId**로 들어올 때, **유예 기간 안**이면 1차 응답은 **`needsReactivation: true`** (JWT 없음)이고, **`confirmReactivation: true`** 가 포함된 2차 요청에서만 `reactivateUser` 후 JWT를 준다. 상세·타입은 [인증 API](../auth/README.md)를 본다.

**유예 기간 밖**(또는 이미 물리 삭제된 경우)에는 **403** 또는 **미가입(`needsSignup`)** 등으로 이어지며, 자동 복구 JWT는 발급하지 않는다.

---

## 6. 관련 코드 위치

| 내용 | 위치 |
|------|------|
| 탈퇴 라우트 | `src/apis/user/controllers/user.controller.ts` — `DELETE me` |
| 탈퇴 로직 | `src/apis/user/services/user.service.ts` — `deleteMyAccount` |
| 유예 만료 물리 삭제 | `src/apis/user/services/user.service.ts` — `purgeSoftDeletedUsersOlderThanDays` |
| FK 정리 후 `user` 삭제 | `src/apis/user/utils/user-hard-delete-cascade.ts` — `hardDeleteUserCascade` |
| 매일 스케줄 | `src/apis/user/user-soft-delete-purge.scheduler.ts` |
| 유예 일수·결과 타입 | `src/apis/user/types/purge-soft-deleted.types.ts` |
| 액세스 토큰 시 활성 사용자 검증 | `src/apis/auth/strategies/jwt-access.strategy.ts` |
| 계정 복구 | `src/apis/user/services/user.service.ts` — `reactivateUser` |
| 로그인 시 복구(2단계) | `src/apis/auth/auth.service.ts` — `issueTokens`, `buildNeedsReactivationResponse` |
| 스케줄 모듈 등록 | `src/app.module.ts` — `ScheduleModule.forRoot()` |
