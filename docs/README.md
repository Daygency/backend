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

## 인증 (토큰) 요약

- **Access Token**: 1시간 | **Refresh Token**: 30일 (만료 시 `POST /auth/refresh`)
- **저장**: `AsyncStorage`(React Native) / `SecureStore` 권장
- **요청 헤더**: `Authorization: Bearer {accessToken}`

자세한 스펙은 [auth-api.md](./auth-api.md)를 참고하세요.
