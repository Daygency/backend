# 알림 · 푸시 (Notifications / FCM)

댓글·팔로우·공고 지원·**좋아요** 시 DB 알림(`notice` / `notice_recipient`)이 쌓이고, 조건이 맞으면 FCM으로 기기 푸시가 발송됩니다.

## 서버 환경 변수

| 변수 | 설명 |
|------|------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` 또는 `fire_service_account_json` 또는 `firebase_service_account_json` | 서비스 계정 **JSON 전체**(한 줄) **또는** 프로젝트 루트 기준 `*.json` **파일 경로** |
| `NOTIFICATION_TEST_PUSH` | `true`일 때만 `POST /notifications/test-push` 허용 (로컬/스테이징용) |

`ConfigModule`이 전역이므로 `.env`에 넣고 서버를 재시작하면 됩니다.

## React Native 시뮬레이터에서 푸시

- **Android 에뮬레이터**: **Google Play 스토어가 있는** 시스템 이미지를 쓰면 FCM 등록 토큰을 받을 수 있는 경우가 많습니다. `@react-native-firebase/messaging` 등으로 토큰을 받은 뒤 `POST /notifications/devices`로 서버에 등록하세요.
- **iOS 시뮬레이터**: 실제 APNs/푸시 동작은 버전·설정에 따라 매우 제한적입니다. **가능하면 실제 기기**로 검증하는 것을 권장합니다.
- 푸시가 안 보여도, 아래 **테스트 푸시 API** 응답의 `successCount`가 올라가면 서버→FCM 구간은 정상인 경우가 많습니다(클라이언트 표시/OS 정책은 별도 확인).

## API 요약

모든 엔드포인트는 **Bearer JWT**(`Authorization: Bearer <access_token>`)가 필요합니다.

Base URL 예: `http://localhost:3000`

### 기기 토큰

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/notifications/devices` | FCM 등록 토큰 등록/갱신 (같은 토큰이면 `user_id`만 갱신) |
| `DELETE` | `/notifications/devices` | body: `{ "fcmToken": "..." }` |

**`POST /notifications/devices` body 예시**

```json
{
  "fcmToken": "<Firebase에서 받은 토큰>",
  "platform": "ANDROID"
}
```

`platform`: `IOS` | `ANDROID` | `WEB` (선택)

### 인박스 · 읽음

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/notifications` | 내 알림 목록 (커서 페이지네이션) |
| `GET` | `/notifications/unread-count` | 읽지 않은 개수 `{ "unreadCount": number }` |
| `PATCH` | `/notifications/read-all` | 내 알림 전부 읽음 `{ "updated": number }` |
| `PATCH` | `/notifications/recipients/:recipientId/read` | 한 건 읽음 (`recipientId` = `notice_recipient.id`) |

**`GET /notifications` 쿼리**

- `cursor` (선택): 직전 응답의 `nextCursor`
- `limit` (선택, 기본 20, 최대 50)

**응답 필드 요약**

- `items[]`: `recipientId`, `readAt`, `notice` (`id`, `targetType`, `targetId`, `likeKind`, `content`, `createdAt`, `actor` …)
  - `targetType === 'LIKE'` 인 경우에만 `likeKind`가 채워짐: `NEWS` | `COMMUNITY` | `ANNOUNCEMENT` | `COMMENT` — 어떤 종류의 콘텐츠에 달린 좋아요인지 구분. `targetId`는 그 대상의 id(뉴스 id, 커뮤니티 글 id, 공고 `postId`, 댓글 id).
- `nextCursor`: 다음 페이지용 (없으면 끝)
- `hasMore`: 더 있는지 여부

**FCM `data` 페이로드**: 일반적으로 `noticeId`, `targetType`, `targetId`가 오며, 좋아요 알림에는 추가로 `likeKind`가 포함됩니다(문자열).

### 테스트 푸시

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/notifications/test-push` | **본인 계정에 등록된 토큰**으로만 테스트 알림 전송 |

- `.env`에 **`NOTIFICATION_TEST_PUSH=true`** 가 있어야 합니다. 없으면 `403`.
- 실제 알림 row는 만들지 않고 **FCM만** 보냅니다.
- `isPushEnabled`는 **검사하지 않습니다** (연동 확인용).

**응답 예시**

```json
{
  "tokenCount": 1,
  "successCount": 1,
  "failureCount": 0,
  "failedTokens": []
}
```

## cURL 예시

```bash
# 토큰 등록
curl -s -X POST "$BASE/notifications/devices" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken":"YOUR_FCM_TOKEN","platform":"ANDROID"}'

# 테스트 푸시 (.env에 NOTIFICATION_TEST_PUSH=true)
curl -s -X POST "$BASE/notifications/test-push" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 알림 목록
curl -s "$BASE/notifications?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 읽지 않은 개수
curl -s "$BASE/notifications/unread-count" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 실제 푸시가 나가는 조건 (비테스트)

- 서비스 계정이 올바르게 로드됨 (기동 로그: `Firebase Admin initialized for FCM.`)
- 수신자 `is_push_enabled === true`
- 수신자에게 등록된 FCM 토큰이 있음

Swagger: 서버 실행 후 `/api` 에서 `notifications` 태그로 동일 API를 호출할 수 있습니다.
