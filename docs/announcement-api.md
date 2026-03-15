# 공고(Announcement) API 명세

> Base URL: 개발 `http://localhost:3000`, 운영은 배포 URL 사용

---

## 목차

1. [공고 유형 목록 조회](#1-공고-유형-목록-조회)
2. [공고 목록 조회](#2-공고-목록-조회)
3. [공고 상세 조회](#3-공고-상세-조회)
4. [모집공고 작성](#4-모집공고-작성)
5. [공고 수정](#5-공고-수정)
6. [공고 삭제](#6-공고-삭제)

---

## 1. 공고 유형 목록 조회

공고 작성/필터 시 사용하는 공고 유형 카테고리 목록을 반환합니다.

### Endpoint

```
GET /announcement/categories
```

### Query Parameters

없음

### Response

| 필드       | 타입   | 설명                |
|-----------|--------|---------------------|
| categoryId | string | 공고 유형 ID (UUID) |
| name      | string | 공고 유형명         |

### Example

**Request**

```
GET /announcement/categories
```

**Response**

```json
[
  { "categoryId": "uuid-1", "name": "오디션(연주자모집)" },
  { "categoryId": "uuid-2", "name": "콩쿨(경연)" },
  { "categoryId": "uuid-3", "name": "입시평가회" },
  { "categoryId": "uuid-4", "name": "마스터클래스" },
  { "categoryId": "uuid-5", "name": "행사" },
  { "categoryId": "uuid-6", "name": "스탭구인" },
  { "categoryId": "uuid-7", "name": "기타" }
]
```

### 참고

- 인증 불필요 (public API)
- name 오름차순 정렬

---

## 2. 공고 목록 조회

무한스크롤 + 필터를 지원하는 공고 목록 조회 API입니다. 최신순 정렬, 모집상태·공고유형·전공 태그 필터를 쿼리로 지정할 수 있습니다.

### Endpoint

```
GET /announcement
```

### Query Parameters

| 파라미터   | 타입   | 필수 | 설명                                           |
|-----------|--------|------|------------------------------------------------|
| cursor    | string | X    | 마지막으로 조회한 post_id (없으면 첫 페이지)   |
| limit     | number | X    | 한 번에 가져올 개수 (기본 20, 최대 50)         |
| status    | enum   | X    | 모집 상태: `OPEN`(모집중), `CLOSED`(모집마감)  |
| categoryId| string | X    | 공고 유형 ID (단일 선택)                       |
| majorIds  | string | X    | 모집 전공 ID (복수 선택 시 콤마 구분)          |

### Response

| 필드       | 타입   | 설명                    |
|-----------|--------|-------------------------|
| items     | array  | 공고 목록               |
| nextCursor| string | null | 다음 페이지 cursor (없으면 null) |
| hasMore   | boolean| 다음 페이지 존재 여부    |

#### items 각 항목

| 필드        | 타입    | 설명                    |
|------------|---------|-------------------------|
| postId     | string  | 공고 ID                 |
| title      | string  | 제목                    |
| type       | string  | 공고 유형명             |
| isRecruiting| boolean| 모집중 여부             |
| dDay       | string  | D-Day (예: D-7, D-Day, 마감) |

### Example

**Request (모집중 + 오디션 + 작곡/지휘 전공)**

```
GET /announcement?status=OPEN&categoryId=uuid-xxx&majorIds=uuid1,uuid2
```

**Request (두 번째 페이지)**

```
GET /announcement?cursor=마지막-postId&limit=20
```

**Response**

```json
{
  "items": [
    {
      "postId": "d45ba94f-3e2a-4e2d-a25b-7b39b0c27a5c",
      "title": "2025 오케스트라 연주자 모집",
      "type": "오디션(연주자모집)",
      "isRecruiting": true,
      "dDay": "D-7"
    }
  ],
  "nextCursor": "d45ba94f-3e2a-4e2d-a25b-7b39b0c27a5c",
  "hasMore": true
}
```

### 참고

- 인증 불필요 (public API)
- 최신순 정렬 (postId DESC)
- 공고유형: 1개만 선택 가능
- 전공: 여러 개 선택 시 `majorIds=uuid1,uuid2,uuid3` 형태
- 전공무관: `majorIds` 생략 시 전공 필터 없이 전체 조회

---

## 3. 공고 상세 조회

단일 공고 상세 정보를 조회합니다.

### Endpoint

```
GET /announcement/:id
```

### Path Parameters

| 파라미터 | 타입   | 필수 | 설명    |
|---------|--------|------|---------|
| id      | string | O    | 공고 ID (post_id) |

### Headers (선택)

| 헤더          | 설명                                           |
|--------------|------------------------------------------------|
| Authorization| Bearer {accessToken} — 있을 경우 `isMine` 정확히 반환 |

### Response

공고 엔티티 정보 + `isMine` 필드

| 필드      | 타입    | 설명                                         |
|----------|---------|----------------------------------------------|
| isMine   | boolean | 내가 쓴 글인지 여부. 로그인 시에만 의미 있음   |
| ...      | -       | 기타 공고 필드 (postId, title, content 등)    |

### 참고

- 인증 불필요 (public API). 로그인 없이도 조회 가능
- 로그인 후 `Authorization` 헤더를 보내면 `isMine`이 `true`/`false`로 정확히 반환됨
- 로그인 안 했을 때는 `isMine`이 항상 `false`

---

## 4. 모집공고 작성

모집공고를 작성합니다. 지원서 양식(application_config)과 함께 저장됩니다.

### Endpoint

```
POST /announcement
```

### Headers

| 헤더          | 설명           |
|--------------|----------------|
| Authorization| Bearer {accessToken} |

### Request Body

| 필드           | 타입    | 필수 | 설명                        |
|---------------|---------|------|-----------------------------|
| title         | string  | O    | 제목                        |
| content       | string  | O    | 내용                        |
| deadlineAt    | string  | O    | 마감일 (ISO 8601)           |
| scheduledAt   | string  | O    | 예정일 (ISO 8601)           |
| status        | enum    | X    | 모집상태 (기본 OPEN)        |
| address       | string  | O    | 공연위치                    |
| fileId        | string  | X    | 대표 파일 ID (썸네일, nullable) |
| categoryId    | string  | O    | 공고 유형 ID                |
| majorIds      | array   | X    | 모집 전공 ID 배열           |
| applicationConfig | object | O | 지원서 양식 설정             |

#### applicationConfig 필드 (모두 boolean, 기본 false)

- includeName, includeBirth, includeGender, includeMajor
- includeMajorDetail, includeEducation, includeCategory, includeMusic
- includeAddress, includeFile, includeLink, includeDepartment
- includeCareer, includeIntroduce

### Example

**Request**

```json
{
  "title": "2025 오케스트라 연주자 모집",
  "content": "내용...",
  "deadlineAt": "2025-04-01T23:59:59.000Z",
  "scheduledAt": "2025-04-15T14:00:00.000Z",
  "address": "서울시 강남구",
  "categoryId": "8deec3e9-09b6-42a0-bd5a-1d3bd618fccd",
  "majorIds": ["550e8400-e29b-41d4-a716-446655440000"],
  "applicationConfig": {
    "includeName": true,
    "includeMajor": true
  }
}
```

**Response (201)**

```json
{
  "postId": "d45ba94f-3e2a-4e2d-a25b-7b39b0c27a5c",
  "title": "2025 오케스트라 연주자 모집",
  "type": "오디션(연주자모집)",
  "isRecruiting": true,
  "dDay": "D-7"
}
```

### 참고

- 인증 필요 (access token)
- categoryId는 필수 (공고 유형 1개)
- fileId는 선택 (없어도 됨)

---

## 5. 공고 수정

공고 정보를 수정합니다. **작성자만** 수정 가능합니다.

### Endpoint

```
PATCH /announcement/:id
```

### Headers

| 헤더          | 설명           |
|--------------|----------------|
| Authorization| Bearer {accessToken} |

### Path Parameters

| 파라미터 | 타입   | 필수 | 설명    |
|---------|--------|------|---------|
| id      | string | O    | 공고 ID |

### Request Body

CreateAnnouncementDto의 모든 필드 **선택(partial)**. 수정할 필드만 보내면 됩니다.

| 필드             | 타입    | 필수 | 설명                        |
|-----------------|---------|------|-----------------------------|
| title           | string  | X    | 제목                        |
| content         | string  | X    | 내용                        |
| deadlineAt      | string  | X    | 마감일 (ISO 8601)           |
| scheduledAt     | string  | X    | 예정일 (ISO 8601)           |
| status          | enum    | X    | 모집상태 (OPEN, CLOSED)     |
| address         | string  | X    | 공연위치                    |
| fileId          | string  | X    | 대표 파일 ID (null 가능)    |
| categoryId      | string  | X    | 공고 유형 ID                |
| majorIds        | array   | X    | 모집 전공 ID 배열           |
| applicationConfig | object | X | 지원서 양식 설정 (일부만 보내도 됨) |

### Response (200)

목록 아이템 형태 (create와 동일)

```json
{
  "postId": "d45ba94f-3e2a-4e2d-a25b-7b39b0c27a5c",
  "title": "2025 오케스트라 연주자 모집 (수정)",
  "type": "오디션(연주자모집)",
  "isRecruiting": true,
  "dDay": "D-7"
}
```

### 에러

| 상태 | 설명                |
|-----|---------------------|
| 401 | 인증 필요           |
| 403 | 수정 권한 없음 (작성자 아님) |
| 404 | 공고를 찾을 수 없음  |

### 참고

- 인증 필요 (access token)
- 작성자 본인만 수정 가능
- 전송한 필드만 업데이트 (partial update)

---

## 6. 공고 삭제

공고를 삭제합니다.

### Endpoint

```
DELETE /announcement/:id
```

### Path Parameters

| 파라미터 | 타입   | 필수 | 설명    |
|---------|--------|------|---------|
| id      | string | O    | 공고 ID |

### 참고

- 구현 상태 확인 필요
