# mbackend

NestJS 기반 Daygency 백엔드 API.

## 실행

```bash
npm install
npm run start:dev
```

개발 기본 URL: `http://localhost:3000`

상세 문서 목차는 [docs/README.md](./docs/README.md)를 참고하세요.

---

## 파일 도메인 (`file`)

### 환경 변수 (S3)

| 변수 | 설명 |
|------|------|
| `AWS_ACCESS_KEY` | IAM 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | IAM 시크릿 |
| `AWS_REGION` | 리전 (예: `ap-northeast-2`) |
| `AWS_S3_BUCKET` | 버킷 이름 |

### `file` 테이블 의미

| 컬럼 | 의미 |
|------|------|
| `type` | 첨부가 **어느 게시판에서 올린 것인지** — `announcement` \| `news` \| `community` |
| `target_id` | 해당 게시글의 PK — 모집공고면 `post_id`, 공연소식이면 `news_id`, 커뮤니티면 `community_id` |
| `order` | 같은 글에 여러 파일일 때 표시 순서 |

대표 썸네일 등으로 `announcement` / `news` / `community` 엔티티의 `file_id`를 쓰는 경우, 추가 이미지·첨부는 같은 `file` 테이블에 `type` + `target_id`로 여러 행을 두고 조회하면 됩니다.

### 서비스 역할

| 서비스 | 용도 |
|--------|------|
| `FileService` | S3 업로드/삭제, DB `file` CRUD, `findByTarget(type, targetId)` |
| `AnnouncementFileService` | 모집공고용 — `attachFilesToPost(postId, items)`, `listFilesForPost(postId)` |
| `NewsFileService` | 공연소식용 — 동일 API, `type` = `news` |
| `CommunityFileService` | 커뮤니티용 — 동일 API, `type` = `community` |

업로드 항목 타입: `PostFileUploadItem` (`buffer`, `originalName`, `contentType?`, `sortOrder?`).

**흐름 예시:** 게시글 본문을 먼저 저장해 ID를 받은 뒤, 해당 ID로 `attachFilesToPost`를 호출합니다. 그러면 각 파일 행에 올바른 `type`·`target_id`가 들어갑니다.

```typescript
// 예: 공고 저장 후
const saved = await announcementService.create(userId, dto);
await announcementFileService.attachFilesToPost(saved.postId, [
  { buffer, originalName: 'a.jpg', contentType: 'image/jpeg' },
]);
```

모듈에서 각 `*FileService`는 `export` 되어 있어 다른 모듈에서 주입해 사용할 수 있습니다.
