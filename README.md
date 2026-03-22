# mbackend

NestJS 기반 Daygency 백엔드 API.

## 실행

```bash
npm install
npm run start:dev
```

개발 기본 URL: `http://localhost:3000`

## 문서

상세 API 목차·인증 요약은 [docs/README.md](./docs/README.md)를 참고하세요.

### 프로필 응답 필드 (팔로우)

- **`GET /users/profile/my`** (인증) · **`GET /users/:id/profile`** (공개)

응답 JSON에 **`followingCount`**, **`followerCount`**(number)가 포함됩니다.

- `followingCount`: 그 유저가 팔로우한 사람 수  
- `followerCount`: 그 유저를 팔로우한 사람 수  

`PATCH /users/profile/my` 성공 응답도 동일합니다.

## 파일 (S3)

`.env`에 다음 변수가 있어야 `FileService`로 업로드·삭제가 동작합니다.

| 변수 | 설명 |
|------|------|
| `AWS_ACCESS_KEY` | IAM 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | IAM 시크릿 |
| `AWS_REGION` | 리전 (예: `ap-northeast-2`) |
| `AWS_S3_BUCKET` | 버킷 이름 |

- **`file` 테이블**: `file_id`, `img_url`, `original_name`, `order`, `stored_name`, `extention`, `type`(enum), `target_id`, `created_at`  
- 서비스: `FileService.uploadAndSave()` — S3 `PutObject` 후 DB 저장, `findByTarget()`, `removeFile()`  
- 공고/뉴스/커뮤니티의 `file_id`는 기존처럼 대표 1건 참조, 나머지 첨부는 같은 테이블에서 `type` + `target_id`로 조회하면 됩니다.
