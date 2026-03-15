## 목록 조회 & 필터링 API 정리

> 서비스 전반에서 사용하는 "목록 조회 + 필터링" 관련 엔드포인트만 모아서 정리한 문서입니다.  
> Base URL: 개발 `http://localhost:3000`, 운영은 배포 URL 사용

---

## 1. 공고 목록 조회 (무한스크롤 + 필터)

### Endpoint

```
GET /announcement
```

### Query Parameters

| 파라미터   | 타입   | 필수 | 설명                                           |
|-----------|--------|------|------------------------------------------------|
| cursor    | string | X    | 마지막으로 조회한 `postId` (없으면 첫 페이지)  |
| limit     | number | X    | 한 번에 가져올 개수 (기본 20, 최대 50)         |
| status    | enum   | X    | 모집 상태: `OPEN`(모집중), `CLOSED`(모집마감)  |
| categoryId| string | X    | 공고 유형 ID (단일 선택)                       |
| majorIds  | string | X    | 모집 전공 ID (복수 선택 시 콤마 구분)          |

### Response

| 필드       | 타입           | 설명                    |
|-----------|----------------|-------------------------|
| items     | array          | 공고 목록               |
| nextCursor| string \| null | 다음 페이지 cursor      |
| hasMore   | boolean        | 다음 페이지 존재 여부    |

#### Example

```http
GET /announcement?status=OPEN&categoryId={categoryId}&majorIds={majorId1},{majorId2}
GET /announcement?cursor={lastPostId}&limit=20
```

---

## 2. 공연소식 목록 조회 (무한스크롤)

### Endpoint

```
GET /news
```

### Query Parameters

| 파라미터 | 타입   | 필수 | 설명                                           |
|---------|--------|------|------------------------------------------------|
| cursor  | string | X    | 마지막으로 조회한 `newsId` (없으면 첫 페이지)  |
| limit   | number | X    | 한 번에 가져올 개수 (기본 20, 최대 50)         |

### Response

| 필드       | 타입           | 설명                    |
|-----------|----------------|-------------------------|
| items     | array          | 공연소식 목록           |
| nextCursor| string \| null | 다음 페이지 cursor      |
| hasMore   | boolean        | 다음 페이지 존재 여부    |

#### Example

```http
GET /news?limit=20
GET /news?cursor={lastNewsId}&limit=20
```

---

## 3. 커뮤니티 목록 조회 (카테고리 필터)

### Endpoint

```
GET /community
```

### Query Parameters

| 파라미터   | 타입   | 필수 | 설명                                             |
|-----------|--------|------|--------------------------------------------------|
| categoryId| string | X    | 커뮤니티 카테고리 ID. 지정 시 해당 카테고리만 조회 |

### Response

`Community` 엔티티 배열이 반환됩니다.

각 항목 예시 스키마:

| 필드        | 타입    | 설명                     |
|------------|---------|--------------------------|
| communityId| string  | 커뮤니티 ID (UUID)       |
| title      | string  | 제목                     |
| content    | string  | 내용                     |
| createdAt  | string  | 생성일시 (ISO 8601)     |
| user       | object  | 작성자 정보 (`User`)     |
| category   | object  | 커뮤니티 카테고리 정보   |
| file       | object  | 첨부 파일 정보 (선택적)  |

#### Example

```http
GET /community
GET /community?categoryId={communityCategoryId}
```

---

## 4. 카테고리 목록 조회 (참고용)

필터링 시 사용하는 카테고리/태그 목록 조회 API입니다.

### 공고 유형 카테고리

```
GET /announcement/categories
```

### 커뮤니티 카테고리

```
GET /community/categories
```

