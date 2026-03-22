# Daygency API 문서

> Base URL: 개발 `http://localhost:3000`, 운영은 배포 URL 사용

---

## 문서 목록

| 문서 | 설명 |
|------|------|
| [auth-api.md](./auth-api.md) | **인증 API** – 소셜 로그인/회원가입, 토큰 사용법 |
| [announcement-api.md](./announcement-api.md) | **공고 API** – 공고 CRUD, 목록/상세/필터 |
| [community-api.md](./community-api.md) | **커뮤니티 API** – 커뮤니티 게시판 CRUD, 카테고리 |
| [news-api.md](./news-api.md) | **공연소식 API** – 공연소식 CRUD, 목록/상세 |
| [api-readme.md](./api-readme.md) | **공통 API** – 활동아이디 중복확인, 공고 유형 목록 등 |

---

## 유저 프로필 (팔로잉·팔로워 수)

| 엔드포인트 | 인증 | 설명 |
|------------|------|------|
| `GET /users/profile/my` | Bearer 필요 | 내 프로필 (연락처 포함) |
| `GET /users/:id/profile` | 불필요 | 타인 프로필 (연락처 제외) |

위 두 응답 모두에 아래 숫자 필드가 **포함**됩니다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `followingCount` | number | 해당 유저가 팔로우한 사람 수 (`follow`에서 `sender_id` = 본인) |
| `followerCount` | number | 해당 유저를 팔로우한 사람 수 (`follow`에서 `receiver_id` = 본인) |

내 프로필 수정(`PATCH /users/profile/my`) 후 응답도 `getMyProfile`과 동일 스키마이므로 동일하게 포함됩니다.

---

## 인증 (토큰) 요약

- **Access Token**: 1시간 | **Refresh Token**: 30일 (만료 시 `POST /auth/refresh`)
- **저장**: `AsyncStorage`(React Native) / `SecureStore` 권장
- **요청 헤더**: `Authorization: Bearer {accessToken}`

자세한 스펙은 [auth-api.md](./auth-api.md)를 참고하세요.
