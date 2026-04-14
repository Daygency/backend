# 모집공고 (Announcement)

Base path: `/announcement` (인증·쿼리는 각 엔드포인트 참고). Swagger: `/api` → **announcements** 태그.

---

## 금액: `priceType` + `price`

DB에는 **`price_type`(enum)** 과 **`price`(정수, 원)** 두 컬럼이 있다. 프론트·API 응답 필드명은 **`priceType`**, **`price`** 이다.  
작성 시 **`priceType`을 생략하면 기본값은 협의(`PENDING`)** 이다.

### `AnnouncementPriceType` (문자열 enum)

| 값 | 의미 |
|----|------|
| `EXPENSE` | 지출 |
| `INCOME` | 수입 |
| `FREE` | 무료 |
| `PENDING` | 협의 가능 |

### `price`

- **0 이상** 정수(원). DTO에서 `@Min(0)` 로 검증한다.
- 의미는 **`priceType`과 조합**해서 해석한다.
  - **`FREE`**, **`PENDING`** 일 때는 보통 **`0`** 을 쓰면 된다.
  - **`EXPENSE`**, **`INCOME`** 일 때는 실제 금액 등으로 **`price`** 에 숫자를 넣는 식으로 쓰면 된다(도메인 규칙은 제품에 맞게).

### TypeScript 타입 (참고)

```typescript
import type { AnnouncementPriceType } from 'src/apis/announcement/entities/announcement.entity';
// 또는 문자열 리터럴 유니온: 'EXPENSE' | 'INCOME' | 'FREE' | 'PENDING'

/** 작성·수정 요청 (CreateAnnouncementDto / UpdateAnnouncementDto) */
interface AnnouncementPriceFields {
  /** 생략 시 서버에서 PENDING(협의) */
  priceType?: AnnouncementPriceType;
  /** 생략 시 0 */
  price?: number;
}

/** 목록·일부 요약 응답에 포함 */
interface AnnouncementListPriceFields {
  priceType: AnnouncementPriceType;
  price: number;
}
```

---

## 모집 전공 리스트 (`majorIds` / `majors`)

공고에 **모집 대상 전공**을 여러 개 붙일 수 있다. DB의 `major` 테이블과 **다대다**로 연결되며, API에서는 UUID **`majorId`** 로만 주고받는다.

선택 가능한 전공 목록은 **`GET /major`** 로 조회한다(인증 불필요, `majorId`·`name` 배열, 이름 오름차순). Swagger `/api` → **majors** 태그.

### 요청 바디 — `majorIds`

| 항목 | 설명 |
|------|------|
| 필드명 | `majorIds` |
| 타입 | `string[]` (각 요소 UUID v4) |
| 필수 여부 | **선택**. 생략하거나 **`[]`** 이면 모집 전공 없음(미지정). |
| 중복 | 같은 ID가 여러 번 오면 서버에서 **한 번만** 반영한다. |
| 검증 | 배열에 넣은 **모든** ID가 `major`에 존재해야 한다. 하나라도 없으면 **400** — 메시지: `존재하지 않는 전공 ID가 포함되어 있습니다.` |

작성·수정 DTO는 각각 `CreateAnnouncementDto`, `UpdateAnnouncementDto`이며, **`majorIds`는 `applicationConfig`와 형제 필드**이다.

#### `POST /announcement` (multipart, 이미지 업로드)

- `Content-Type`: `multipart/form-data`
- 필드 **`payload`**: 아래 JSON을 **문자열**로 넣는다.
- 필드 **`files`**: 선택, 첨부 이미지(최대 20개).

`payload` JSON 예시(모집 전공만 발췌):

```json
{
  "title": "…",
  "content": "…",
  "deadlineAt": "2026-04-01T23:59:59.000Z",
  "scheduledAt": "2026-04-15T14:00:00.000Z",
  "address": "…",
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "majorIds": [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002"
  ],
  "applicationConfig": { "includeName": true }
}
```

#### `POST /announcement/json` (JSON only, 파일 없음)

- `Content-Type`: `application/json`
- 바디가 곧 `CreateAnnouncementDto` 객체이므로 **`payload` 래핑 없음**.

#### `PATCH /announcement/:id` (수정)

- `majorIds`를 **보낸 경우에만** 모집 전공이 갱신된다(`PartialType`).
- **`majorIds: []`** 를 보내면 모집 전공을 **전부 제거**한다.

### 응답 — 작성·수정 시 `majors`

작성(`POST`)·수정(`PATCH`) 성공 시, 목록 요약 필드(`postId`, `title`, `type`, `isRecruiting`, `dDay`, `priceType`, `price`) 외에 **저장된 모집 전공**이 아래 형태로 온다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `majors` | `Array<{ majorId: string; name: string }>` | 저장 직후 확정된 전공 목록. 미지정이면 **`[]`**. |

- **`POST /announcement`**, **`POST /announcement/json`**: 위에 더해 **`attachments`** 배열(업로드한 파일 메타)이 포함된다. 전공이 없으면 `majors`는 `[]`.

```typescript
/** 작성 응답(파일 업로드 시) — majors·attachments 참고 */
interface CreateAnnouncementResponse {
  postId: string;
  title: string;
  type: string;
  isRecruiting: boolean;
  dDay: string;
  priceType: 'EXPENSE' | 'INCOME' | 'FREE' | 'PENDING';
  price: number;
  majors: Array<{ majorId: string; name: string }>;
  attachments: Array<{ fileId: string; imgUrl: string; sortOrder: number }>;
}
```

```typescript
/** 수정 응답 */
interface UpdateAnnouncementResponse {
  postId: string;
  title: string;
  type: string;
  isRecruiting: boolean;
  dDay: string;
  priceType: 'EXPENSE' | 'INCOME' | 'FREE' | 'PENDING';
  price: number;
  majors: Array<{ majorId: string; name: string }>;
}
```

### 상세 조회 `GET /announcement/:id`

- 공고 엔티티에 `majors` 관계가 포함된다(전공 객체 배열 — `Major` 엔티티 필드: `majorId`, `name` 등). 작성·수정 응답의 `majors`와 동일한 식별 정보로 맞추어 쓰면 된다.

### 목록 필터와의 관계

- 공고 목록 `GET /announcement`·`GET /announcement/my` 에서 쿼리 **`majorIds`**(콤마 구분 문자열)로 **해당 전공 중 하나라도** 걸린 공고만 볼 수 있다. 작성 시 `majorIds` 배열과 이름은 같지만 **목록은 쿼리스트링**이다.

---

## 작성·수정 (`CreateAnnouncementDto` / `UpdateAnnouncementDto`)

- **`priceType`**: 선택. 생략 시 **`PENDING`(협의)** 으로 저장된다.
- **`price`**: 선택. 생략 시 **`0`** 이다.
- 수정(`PATCH`) 시에는 보낸 필드만 갱신한다(`UpdateAnnouncementDto`는 `PartialType`).

---

## 응답에 `priceType` / `price` 가 실리는 곳

| 구분 | 설명 |
|------|------|
| 공고 목록·내 공고 목록 | `AnnouncementService` 목록 아이템에 둘 다 포함 |
| 공고 상세 | `findOne` — 엔티티 스프레드 + `isMine` 등 |
| 홈 | `latestAnnouncements` 항목 |
| 사용자 마이페이지 | 작성 글·내 공고·스크랩 공고·포스트 하이라이트 등 공고가 붙는 응답 |

---

## 관련 코드

| 내용 | 위치 |
|------|------|
| enum·컬럼 정의 | `entities/announcement.entity.ts` |
| 작성 DTO | `dto/create-announcement.dto.ts` |
| 수정 DTO | `dto/update-announcement.dto.ts` |
| 전공 ID 검증·저장·응답 매핑 | `announcement.service.ts` (`resolveMajorsByIds`, 등) |
