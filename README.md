# Daygency Backend

NestJS 기반 API 서버입니다. 채팅 도메인은 **REST**로 채팅방·메시지 히스토리를 다루고, **Socket.IO(WebSocket Gateway)**로 실시간 송수신을 제공합니다.

---

## 요구 사항

- Node.js (프로젝트에 맞는 LTS 권장)
- MySQL
- 환경 변수 (루트 `.env` 등)

```env
DATABASE_TYPE=mysql
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USERNAME=root
DATABASE_PASSWORD=
DATABASE_NAME=your_db
JWT_ACCESS_SECRET=your_jwt_secret
PORT=3000
```

`JWT_ACCESS_SECRET`은 REST `Authorization: Bearer` 및 WebSocket 연결 시 JWT 검증에 사용됩니다.

---

## 채팅 유형 (요약)

| 유형 | 설명 |
|------|------|
| **커피챗(COFFEE)** | 일반 1:1. 사용자 두 명의 UUID를 정렬해 `(participant_low_id, participant_high_id)`로 유일하게 둡니다. |
| **공고(ANNOUNCEMENT)** | 특정 **모집공고(`announcement.post_id`)** × **지원자 1명**당 채팅방 1개. 작성자와 그 지원자만 입장합니다. |

**화면 흐름 예시**

1. **커피챗 목록**: `GET /chat/rooms/coffee`
2. **내가 지원한 공고 채팅 목록**: `GET /chat/rooms/applied`
3. **내가 만든 공고 목록**: `GET /announcement/my` → 공고 하나 선택
4. **그 공고에 매핑된 지원자별 1:1 방 목록**: `GET /chat/rooms/by-post/:postId` (해당 공고 **작성자**만)

방이 없으면 `POST /chat/rooms/coffee` 또는 `POST /chat/rooms/announcement`로 생성·조회(get-or-create)합니다.

---

## 채팅 도메인 — 데이터베이스 스키마

TypeORM 엔티티(`synchronize: true` 사용 시)와 동일한 구조입니다. ID는 UUID입니다.

### `chat_room` (채팅방)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 채팅방 ID |
| `kind` | enum | NOT NULL | `COFFEE` \| `ANNOUNCEMENT` |
| `participant_low_id`, `participant_high_id` | `char(36)` | NULL | **COFFEE**일 때만 사용. 두 사용자 ID를 문자열 순으로 정렬해 저장 |
| `post_id` | `char(36)` | NULL | **ANNOUNCEMENT**일 때 `announcement.post_id` |
| `applicant_user_id` | `char(36)` | NULL | **ANNOUNCEMENT**일 때 지원자 `user_id` (공고 작성자와 1:1) |
| `form_id` | `char(36)` | NULL | 예비(외부 지원서 엔티티 등) |
| `created_at` | `datetime(6)` | NOT NULL | 생성 시각 |
| `deleted_at` | `datetime` | NULL | 소프트 삭제 |

유니크: `(participant_low_id, participant_high_id)`, `(post_id, applicant_user_id)` — MySQL에서는 NULL이 포함된 행은 유니크 중복으로 치지 않아, COFFEE/ANNOUNCEMENT가 같은 테이블을 씁니다.

### `message` (메시지)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | UUID | PK | 메시지 ID |
| `chat_room_id` | `char(36)` | FK | 소속 채팅방 |
| `user_id` | `char(36)` | FK → `user.user_id` | 발신자 |
| `content` | `varchar(255)` | NULL | 본문 |
| `created_at` | `datetime(6)` | NOT NULL | 작성 시각 |

---

## REST API — 공고 (내가 쓴 글 목록)

`Authorization: Bearer <access_token>`

### `GET /announcement/my`

내가 작성한 모집공고 목록입니다. 쿼리는 전체 공고 목록(`GET /announcement`)과 동일하게 **cursor, limit, status, categoryId, majorIds** 를 쓸 수 있습니다.

응답 형태: `{ items: [{ postId, title, type, isRecruiting, dDay }], nextCursor, hasMore }`

---

## REST API — 채팅

기본 URL: `http://localhost:{PORT}`  
Swagger UI: `http://localhost:{PORT}/api`

채팅 REST는 모두 **액세스 JWT** 필요: `Authorization: Bearer <access_token>`

### 목록 (무한 스크롤)

공통 쿼리: `cursor` (마지막 `chat_room.id`), `limit` (기본 20, 최대 50)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/chat/rooms/coffee` | 커피챗(일반 1:1) 채팅방 목록 |
| GET | `/chat/rooms/applied` | 내가 **지원자**인 공고 1:1 방 목록 |
| GET | `/chat/rooms/by-post/:postId` | 내가 **작성한** 해당 공고에 대한 지원자별 1:1 방 목록 |

목록 항목 예: `id`, `kind`, `post`(공고면 `postId`, `title`), `peer`(상대 프로필 요약), `lastMessage`, `createdAt`.

### 방 생성·조회 (get-or-create)

| 메서드 | 경로 | Body | 설명 |
|--------|------|------|------|
| POST | `/chat/rooms/coffee` | `{ "peerUserId": "<uuid>" }` | 커피챗 1:1 방 생성 또는 기존 방 반환 |
| POST | `/chat/rooms/announcement` | `{ "postId": "<uuid>", "applicantUserId?": "<uuid>" }` | 공고 1:1 방. `applicantUserId` 생략 시 본인이 지원자. **작성자만** 특정 지원자를 지정 가능 |

### `GET /chat/rooms/:roomId/messages` (메시지 히스토리)

해당 채팅방의 메시지를 **최신순**으로 페이지네이션합니다. **해당 방에 참여한 사용자만** 조회할 수 있습니다.

**Query**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `page` | 정수 | `1` | 페이지 |
| `limit` | 정수 | `50` | 페이지 크기 (1–100) |

**Response (예)**

```json
{
  "items": [
    {
      "id": "uuid",
      "chatRoomId": "uuid",
      "userId": "uuid",
      "content": "문자열 또는 null",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 50
}
```

---

## WebSocket (Socket.IO Gateway)

NestJS `@WebSocketGateway` + **namespace** `/chat`

- URL: `http(s)://<host>:<port>/chat`

### 인증

`auth: { token: '<access_token>' }` 또는 `Authorization: Bearer ...`

### 이벤트

| 방향 | 이벤트 | 설명 |
|------|--------|------|
| emit | `joinRoom` | `{ chatRoomId }` — 방 참가자만 성공 |
| emit | `leaveRoom` | `{ chatRoomId }` |
| emit | `sendMessage` | `{ chatRoomId, content? }` |
| on | `message` | `{ id, chatRoomId, userId, content, createdAt }` |

`joinRoom` / 메시지 조회·전송은 서버에서 **참여자 여부**를 검사합니다.

---

## 개발 서버 실행

```bash
npm install
npm run start:dev
```

---

## 구현 위치 (참고)

| 구분 | 경로 |
|------|------|
| 채팅 모듈 | `src/apis/chat/chat.module.ts` |
| WebSocket Gateway | `src/apis/chat/chat.gateway.ts` |
| REST 컨트롤러 | `src/apis/chat/chat.controller.ts` |
| 서비스 | `src/apis/chat/chat.service.ts` |
| 엔티티 | `src/apis/chat/entities/*.entity.ts` |
| 내 공고 목록 | `src/apis/announcement/announcement.controller.ts` (`GET /announcement/my`) |

WebSocket 어댑터는 `src/main.ts`에서 `IoAdapter`로 등록되어 있습니다.
