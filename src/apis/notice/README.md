# 알림 · 푸시 (Notifications / FCM)

이벤트마다 DB 알림(`notice` / `notice_recipient`)이 쌓이고, 수신자의 `isPushEnabled === true` + 등록된 FCM 토큰이 있으면 FCM 푸시도 함께 간다.

| 이벤트 | 인박스(DB) | FCM 푸시 |
|--------|------------|----------|
| 댓글 | ✅ | ✅ (설정·토큰 있을 때) |
| 좋아요 | ✅ | ✅ (설정·토큰 있을 때) |
| 팔로우 | ✅ | ✅ (설정·토큰 있을 때) |
| 공고 지원 | ✅ | ✅ (설정·토큰 있을 때) |
| 공고 지원 합격/불합격 처리 | ✅ | ✅ (설정·토큰 있을 때 — 상태가 실제로 바뀌고 ACCEPTED/REJECTED일 때만) |
| 활동 후기 | ✅ | ✅ (설정·토큰 있을 때) |
| 고객센터 답변 | ✅ | ✅ (설정·토큰 있을 때) |
| 관리자 전체 공지 | ✅ | ✅ (`isPushEnabled` 무시, 항상) |
| 채팅 새 메시지 | ❌ (채팅은 `message`/`chat_room_member.last_read_at`로 자체 관리) | ✅ (설정·토큰 있고, 해당 방을 음소거하지 않았을 때 — `NoticeService.sendChatPush`) |

## 서버 환경 변수

| 변수 | 설명 |
|------|------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` 또는 `fire_service_account_json` 또는 `firebase_service_account_json` | 서비스 계정 **JSON 전체**(한 줄) **또는** 프로젝트 루트 기준 `*.json` **파일 경로** |
| `NOTIFICATION_TEST_PUSH` | `true`일 때만 `POST /notifications/test-push` 허용 (로컬/스테이징용) |

`ConfigModule`이 전역이므로 `.env`에 넣고 서버를 재시작하면 됩니다.

## 프론트엔드 연동: 디바이스 등록은 언제 하나요?

**`POST /notifications/devices`는 “알림(푸시)을 켜겠다”는 흐름에서, FCM 등록 토큰을 받은 직후 호출하면 됩니다.** OS 알림 권한을 요청·허용한 뒤에만 대부분의 환경에서 유효한 토큰을 받을 수 있으므로, **권한 동의(또는 앱 내 ‘푸시 알림 받기’ 토글 ON) → Firebase/FCM에서 `fcmToken` 획득 → 이 API로 서버에 등록** 순서가 일반적입니다.

- **로그인 필수**: 요청 헤더에 **앱 로그인 후 받은 JWT** `Authorization: Bearer <access_token>` 이 있어야 합니다. 비로그인 상태에서는 등록할 수 없습니다.
- **토큰 갱신**: FCM 토큰은 기기·앱 업데이트 등으로 바뀔 수 있습니다. 토큰이 갱신되면 **같은 API를 다시 호출하면** 서버가 해당 토큰의 `user_id`를 최신으로 맞춥니다.
- **테스트 푸시(`POST /notifications/test-push`)**: `NOTIFICATION_TEST_PUSH=true`일 때, **현재 로그인한 계정에 등록된 FCM 토큰이 하나도 없으면** `400`과 메시지  
  `등록된 FCM 토큰이 없습니다. 앱에서 POST /notifications/devices 로 토큰을 등록하세요.`  
  가 내려갑니다. **curl로 테스트 푸시만 치기 전에**, 앱에서 한 번 디바이스 등록을 해 두거나, 동일 계정으로 등록용 curl을 먼저 호출해야 합니다.
- **실서비스 푸시(팔로우·지원 등)**: DB 알림과 별개로, 서버는 **`user_push_device`에 토큰이 있고** 사용자 **`is_push_enabled === true`** 일 때 FCM을 보냅니다. 앱에서 푸시 OFF로 바꿀 때는 서버의 사용자 설정 API로 `isPushEnabled`를 끄고, 필요하면 `DELETE /notifications/devices`로 토큰 제거를 검토하세요.

정리: **“알림 동의할 때(또는 앱에서 푸시를 켤 때)” 토큰을 받아서 `POST /notifications/devices`를 호출하면 됩니다.** 동의만 하고 이 API를 호출하지 않으면 서버는 기기를 모르므로 테스트 푸시·실제 푸시 모두 해당 기기로는 갈 수 없습니다.

## 프론트엔드에 물어볼 것 (푸시 이슈 공유용)

아래를 그대로 이슈/슬랙에 붙여서 답 받으면, **서버 문제 vs 앱·Firebase·OS 설정**을 빨리 가릴 수 있습니다.

### 공통

1. **어떤 API 베이스 URL**로 `POST /notifications/devices` 를 치고 있나요? (로컬/스테이징/운영 혼동 여부)
2. 로그인 직후 **JWT를 넣어서** 디바이스 등록했을 때 **HTTP 상태 코드와 응답 body**는 무엇인가요? (2xx인지, 401인지)
3. FCM **등록 토큰**을 받는 시점이 언제인가요? (앱 실행 직후 / 알림 권한 승인 후 / 별도 토글 ON 후)
4. **토큰 갱신**(`onTokenRefresh` 등) 시 서버에 **다시 등록**하는 로직이 있나요?
5. 앱의 **`google-services.json`(Android) / `GoogleService-Info.plist`(iOS)** 가 쓰는 **Firebase 프로젝트**가 백엔드 서비스 계정과 **동일 프로젝트**인가요? (발신자 ID·콘솔 프로젝트 이름으로 맞춰 보면 됨)
6. 사용자 **푸시 OFF** 시 서버 **`isPushEnabled`** 를 끄는 API를 호출하나요? (켜 두면 서버는 실제 푸시를 보냄)

### Android

7. **알림 권한**(Android 13+) 요청 후 **허용** 상태인가요?
8. **Notification 채널**을 만들었고, 채널이 차단되지 않았나요?
9. 테스트는 **실기기**인가요, **에뮬**인가요? (Play 스토어 없는 에뮬은 FCM이 안 되는 경우가 많음)
10. **포그라운드**일 때는 시스템 배너가 안 뜨고 `onMessage`만 오는 구조인가요? 그 경우 **로컬 알림**을 띄우고 있나요?

### iOS

11. Firebase 콘솔 **Cloud Messaging → Apple 앱 구성**에 **APNs 인증 키(.p8)** (또는 인증서)가 **등록**되어 있나요? 없으면 FCM이 APNs로 못 넘겨 **기기에 안 뜰 수 있음**.
12. Xcode **Push Notifications** capability 켜져 있나요?
13. **실기기**에서 테스트 중인가요? (시뮬레이터는 제약이 큼)
14. 포그라운드 처리 방식은 Android 10번과 동일하게 확인.

### 증거로 같이 달라고 하면 좋은 것

- 디바이스 등록 요청 한 번의 **요청 URL / 상태 코드** (토큰 값은 마스킹)
- **OS 알림 설정** 화면에서 해당 앱 알림이 허용인지 캡처
- 가능하면 **수신 콜백 로그** (`onMessage` / `setBackgroundMessageHandler` 등)에 메시지가 찍히는지 여부

## React Native 시뮬레이터에서 푸시

- **Android 에뮬레이터**: **Google Play 스토어가 있는** 시스템 이미지를 쓰면 FCM 등록 토큰을 받을 수 있는 경우가 많습니다. `@react-native-firebase/messaging` 등으로 토큰을 받은 뒤 `POST /notifications/devices`로 서버에 등록하세요.
- **iOS 시뮬레이터**: 실제 APNs/푸시 동작은 버전·설정에 따라 매우 제한적입니다. **가능하면 실제 기기**로 검증하는 것을 권장합니다.
- 푸시가 안 보여도, **테스트 푸시 API** 응답에서 `failureCount === 0` 이고 `successCount === tokenCount`이면 서버→FCM 전송은 성공으로 집계된 것입니다(기기 표시/OS 정책은 별도). `failureCount > 0`이면 FCM이 거절한 것이므로 서버 로그·Firebase 서비스 계정·프로젝트 설정을 확인하세요.

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

### HTTP 오류 정리 (테스트 푸시)

| 상태 | 의미 |
|------|------|
| `401` | JWT 없음·만료 |
| `403` | 서버에 `NOTIFICATION_TEST_PUSH=true` 없음 |
| `400` | 이 계정에 등록된 FCM 토큰 없음 → 먼저 `POST /notifications/devices` 또는 앱에서 푸시 켜고 `syncFcmTokenToServer()` |
| `503` | 서버 FCM(서비스 계정) 미설정 |

## 앱 UI: 테스트 푸시 버튼 (React Native / Expo)

프론트 레포 기준 안내입니다.

- **호출**: `POST ${API_BASE}/notifications/test-push` — body 없음, 헤더는 다른 알림 API와 동일(`Content-Type: application/json`, `Authorization: Bearer <액세스 JWT>`).
- **구현 위치**: `src/lib/apis/notifications/notificationsApi.ts`에 함수 추가 권장. `authJsonHeaders()`와 `fetchWithAuth()`를 `getNotifications` / `registerPushDevice`와 같은 방식으로 사용.
- **화면**: 예) `NotificationSettingsScreen` 하단에 버튼 → 탭 시 로딩 후 성공/실패를 Alert 등으로 표시 (`successCount` / `failureCount` 요약).
- **사전 조건**: 로그인 상태 + 서버에 FCM 토큰 등록 완료. 앱에서는 알림 켠 뒤 `syncFcmTokenToServer()` 흐름(`src/lib/fcmServerSync.ts`)이 돈 다음에 누르는 것이 안전.
- **프로덕션**: 버튼은 `__DEV__` 또는 `EXPO_PUBLIC_*` 플래그로 숨겨도 됨.

### Cursor·담당자 전달용 프롬프트 (복사용)

```text
Daygency React Native(Expo) 앱에 "테스트 푸시" 버튼을 추가해 줘.

백엔드 API:
- POST {API_BASE}/notifications/test-push
- 헤더: Content-Type: application/json, Authorization: Bearer <액세스 JWT>
- body 없음
- 성공 시 JSON: { tokenCount, successCount, failureCount, failedTokens }
- 403이면 서버에서 NOTIFICATION_TEST_PUSH가 꺼진 것
- 400이면 "등록된 FCM 토큰이 없음" → 사용자에게 푸시 켜고 로그인 상태에서 FCM 동기화 후 재시도 안내
- 구현은 기존 src/lib/apis/notifications/notificationsApi.ts 패턴: authJsonHeaders()와 fetchWithAuth() 사용 (getNotifications, registerPushDevice와 동일 스타일)
- 새 함수 예: requestTestPush() — UI에서 Alert에 쓰기 좋게 ok / data / errorMessage 형태로 반환

UI:
- 알림 설정 화면(NotificationSettingsScreen) 또는 개발용으로만 보이게 Settings 하단 등에 버튼
- 탭 시 로딩 후 성공/실패를 Alert 또는 Toast로 표시
- 비로그인 시 기존처럼 "로그인이 필요합니다" 처리

주의: 실제 푸시는 Firebase + 기기 권한 + 서버 등록 토큰이 있어야 도착함. 프로덕션에서 버튼 숨김은 __DEV__ 또는 EXPO_PUBLIC_* 로 가드 가능.
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
