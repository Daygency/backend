# Daygency Backend

NestJS 기반 API 서버입니다. Swagger UI: 서버 기동 후 [`/api`](http://localhost:3000/api) (기본 포트 `3000`).

---

## 알림 API (`/notifications`)

공통 헤더:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

(`DELETE`의 JSON body가 있는 경우에도 동일)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/notifications/devices` | FCM 등록 토큰 등록·갱신 |
| `DELETE` | `/notifications/devices` | FCM 토큰 해제 |
| `GET` | `/notifications` | 내 인박스 목록 (커서 페이지네이션) |
| `GET` | `/notifications/unread-count` | 읽지 않은 알림 개수 |
| `PATCH` | `/notifications/read-all` | 내 알림 전부 읽음 |
| `PATCH` | `/notifications/recipients/:recipientId/read` | 한 건 읽음 |
| `POST` | `/notifications/test-push` | 테스트 FCM (`NOTIFICATION_TEST_PUSH=true` 필요) |

---

### `POST /notifications/devices`

**요청 body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `fcmToken` | `string` | ✅ | FCM 등록 토큰 (길이 10~512) |
| `platform` | `"IOS"` \| `"ANDROID"` \| `"WEB"` | ❌ | 기기 플랫폼 |

```json
{
  "fcmToken": "<Firebase에서 받은 토큰>",
  "platform": "ANDROID"
}
```

**응답** — 성공 시 **본문 없음** (HTTP 200). 동일 `fcmToken`이 이미 있으면 소유 `user_id`·`platform`만 갱신.

---

### `DELETE /notifications/devices`

**요청 body**

| 필드 | 타입 | 필수 |
|------|------|------|
| `fcmToken` | `string` | ✅ |

```json
{
  "fcmToken": "<해제할 토큰>"
}
```

**응답** — 성공 시 **본문 없음** (HTTP 200). 해당 유저·토큰 조합만 삭제.

---

### `GET /notifications`

**쿼리**

| 파라미터 | 타입 | 기본 | 설명 |
|----------|------|------|------|
| `cursor` | `string` | — | 직전 응답의 `nextCursor` |
| `limit` | `number` | `20` | 1~50 |

**응답 body**

```json
{
  "items": [
    {
      "recipientId": "uuid",
      "readAt": "2026-04-15T12:00:00.000Z",
      "notice": {
        "id": "uuid",
        "targetType": "COMMENT",
        "targetId": "uuid",
        "likeKind": null,
        "content": "미리보기 문구 또는 null",
        "createdAt": "2026-04-15T11:59:00.000Z",
        "actor": {
          "userId": "uuid",
          "nickname": "string",
          "activityName": "string",
          "profileImgUrl": "string 또는 null"
        }
      }
    }
  ],
  "nextCursor": "string 또는 null",
  "hasMore": true
}
```

- `readAt`: 아직 안 읽었으면 `null`.
- `targetType`: `COMMENT` \| `FOLLOW` \| `APPLICATION` \| `LIKE`.
- `likeKind`: **`targetType === "LIKE"`일 때만** `NEWS` \| `COMMUNITY` \| `ANNOUNCEMENT` \| `COMMENT`, 그 외 `null`.
- `actor`: 행위자 유저가 없으면 `null` (일반적으로는 객체).
- 날짜 필드는 JSON에서 ISO 8601 문자열로 직렬화됩니다.

---

### `GET /notifications/unread-count`

**요청** — body 없음.

**응답 body**

```json
{
  "unreadCount": 3
}
```

---

### `PATCH /notifications/read-all`

**요청** — body 없음.

**응답 body**

```json
{
  "updated": 12
}
```

`updated`: 이번 요청으로 읽음 처리된 행 수(`read_at`이 비어 있던 수신 건 수).

---

### `PATCH /notifications/recipients/:recipientId/read`

**경로**

| 파라미터 | 설명 |
|----------|------|
| `recipientId` | `notice_recipient.id` (UUID) |

**요청** — body 없음.

**응답** — 성공 시 **본문 없음** (HTTP 200). 이미 읽음이면 그대로 200.

**오류**

| HTTP | 조건 |
|------|------|
| `404` | 해당 `recipientId` 없음 |
| `403` | 다른 유저의 수신 건 |

---

### `POST /notifications/test-push`

**요청** — body 없음.

**응답 body** (성공)

```json
{
  "tokenCount": 2,
  "successCount": 2,
  "failureCount": 0,
  "failedTokens": []
}
```

| 필드 | 설명 |
|------|------|
| `tokenCount` | 이 계정에 등록된 FCM 토큰 개수 |
| `successCount` | FCM이 성공으로 처리한 전송 수 |
| `failureCount` | 실패 수 |
| `failedTokens` | 실패한 토큰 문자열 배열(해당 토큰은 DB에서 삭제됨) |

**오류·부가 동작**

| HTTP | 조건 |
|------|------|
| `403` | `NOTIFICATION_TEST_PUSH` 가 `true`가 아님 |
| `400` | 등록된 FCM 토큰 없음 |
| `503` | FCM 미설정이거나, 전송이 전부 실패한 경우 등 |

테스트 푸시는 **`isPushEnabled`를 보지 않고** 보냅니다(연동 확인용).

---

### 푸시 수신 ON/OFF (알림 API 외)

실서비스 FCM은 사용자 **`isPushEnabled`** 와 등록 토큰을 함께 봅니다. 변경은 **`PATCH /users/profile/my`** 요청 body에 `isPushEnabled` 를 넣어 처리합니다.

---

## 상세 문서

FCM 환경 변수, 이벤트별 인박스/푸시 동작, cURL 예시, 프론트 연동 노트:

- [`src/apis/notice/README.md`](src/apis/notice/README.md)

구현: `src/apis/notice/` (`NoticeController` → `@Controller('notifications')`).
