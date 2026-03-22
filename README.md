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
