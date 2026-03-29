# 인증 API — 프론트엔드 가이드

Base URL 예: `https://api.example.com` (로컬 `http://localhost:3000`)  
공통: `Content-Type: application/json`

---

## 네이버 로그인 (인가 **code** 방식)

### 백엔드 `.env` — 지원하는 변수 이름 (하나씩만 맞추면 됨)

서버가 **아래 순서**로 읽습니다. **값에 따옴표/공백**만 조심하면 됩니다.

| 용도 | 후보 1 (권장) | 후보 2 | 후보 3 |
|------|----------------|--------|--------|
| Client ID | `OAUTH_NAVER_CLIENT_ID` | `NAVER_CLIENT_ID` | `oauth_naver_client_id` |
| Client Secret | `OAUTH_NAVER_CLIENT_SECRET` | `NAVER_CLIENT_SECRET` | `oauth_naver_client_secret` |

- **시크릿은 절대 앱(Expo/RN) 코드나 번들에 넣지 마세요.** 토큰 교환은 서버만 합니다.
- `.env` 수정 후 **Nest 프로세스를 재시작**해야 반영됩니다.

### 프론트(Expo 등)

- **`EXPO_PUBLIC_NAVER_CLIENT_ID`** (또는 앱에 쓰는 공개 ID)만 사용 — 네이버 개발자센터의 **애플리케이션 Client ID**와 동일해야 합니다.
- 서버 `.env`의 ID와 **원칙적으로 같은 앱의 같은 Client ID**여야 authorize / token 교환이 맞습니다. (개발용 앱/운영용 앱이 다르면 각각 맞춰야 함)

### 1) `POST /auth/naver`

**Body**

```json
{
  "code": "<네이버 인가 코드>",
  "redirectUri": "<앱 OAuth 에 쓴 값과 완전 동일>",
  "redirect_uri": "<위와 동일 (선택, 권장)>",
  "state": "<인가에 state 썼을 때만 동일 값>"
}
```

- `code`: **1회용**. 같은 `code`로 두 번 호출하면 두 번째는 실패합니다.
- `redirectUri` / `redirect_uri`: 둘 다 있으면 **문자열이 완전히 같아야** 합니다.
- **내면 안 되는 것:** `code` 대신 아직 교환 안 된 값을 `accessToken` 필드에 넣기.

**응답 — 이미 가입**

`accessToken`, `refreshToken`, `user` (자체 JWT)

**응답 — 미가입**

`needsSignup`, `profile`, `naverAccessToken`, `oauthAccessToken`(동일 값)  
→ 가입 시 `POST /auth/signup/naver` 의 **`accessToken`에 위 네이버 액세스 토큰**을 넣습니다.

### 2) `POST /auth/signup/naver`

```json
{
  "accessToken": "<로그인 응답의 naverAccessToken 또는 oauthAccessToken>",
  "activityName": "필수",
  "nickname": "선택",
  "role": "선택 — 반드시 `user` 또는 `admin` (미입력·다른 값은 `user` 로 저장)"
}
```

> **참고:** DB `role` 컬럼은 `user` / `admin` 만 허용합니다. `artist` 같은 값은 넣지 말거나, 서버가 자동으로 `user` 로 맞춥니다.

---

## 에러 났을 때 — 백엔드 vs 프론트 구분

| 증상 | 원인 후보 |
|------|-----------|
| HTTP **400** + `NAVER_CLIENT…` / `OAUTH_NAVER…` / `서버 .env 에 네이버 클라이언트…` | 서버에 ID·Secret이 안 읽힘 → 변수 이름·재시작·배포 환경의 env 확인 |
| HTTP **401** + 네이버 토큰/인가 관련 메시지 | `code` 만료·재사용, `redirect_uri` 불일치, 잘못된 `code`, 앱/서버 Client ID 불일치 |
| CORS / 네트워크 에러 | API Base URL, HTTPS 혼합, 프록시 |
| 로그인은 되는데 가입만 실패 | `signup`의 `accessToken`이 **네이버 OAuth 액세스 토큰**인지 확인 (`code` 넣지 않음) |

프론트에서 **응답 body의 `message`**(또는 Nest 에러 객체)를 로그로 남기면, 위 표로 원인 좁히기 쉽습니다.

---

## 자주 틀리는 부분

| 항목 | 내용 |
|------|------|
| `redirect_uri` | authorize URL 과 token 요청 값 **완전 동일** |
| code 재사용 | 두 번째 요청부터 실패 |
| 서버 env 이름 | `OAUTH_NAVER_CLIENT_ID` 는 이제 백엔드에서 지원함 (이전에는 소문자 `oauth_naver_*` 만 보던 경우 있음) |

---

## 카카오 (참고)

| 단계 | 경로 |
|------|------|
| 로그인 | `POST /auth/kakao` — `{ "accessToken" }` |
| 가입 | `POST /auth/signup/kakao` |

---

## `POST /auth/refresh`

```json
{ "refreshToken": "…" }
```

---

## Swagger

`/api` → **auth** 태그
