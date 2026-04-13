# 인증 API — 프론트엔드 가이드

Base URL 예: `https://api.example.com` (로컬 `http://localhost:3000`)  
공통: `Content-Type: application/json`

---

## 탈퇴(소프트 삭제) 직후 로그인 — 2단계 복구

유예 기간(`SOFT_DELETE_RETENTION_DAYS`, **7일**) **안**에 소프트 삭제된 계정이면, **자동 로그인(JWT)** 을 하지 않는다.

### 1차 — 로그인(확인 전)

`POST /auth/kakao`, `POST /auth/naver` (또는 `POST /auth/google`)에 평소와 같이 **`accessToken` 또는 `access_token`** 만 보낸다.

**응답 200** + `needsReactivation: true` — **자체 `accessToken` / `refreshToken` / 로그인 완료 `user` 는 없다.**

```typescript
interface NeedsReactivationLoginResponse {
  needsReactivation: true;
  deletedAt: string; // ISO 8601
  reactivationDeadline: string; // ISO 8601 (대략 deletedAt + 7일)
  profile: {
    socialId: string;
    nickname: string;
    email: string;
    profileImgUrl: string;
  };
  user: {
    userId: string;
    nickname: string;
    activityName: string;
    profileImgUrl: string;
  };
}
```

### 2차 — 복구 확정

**같은 엔드포인트**에 동일 소셜 토큰 + **`confirmReactivation: true`**:

```json
{
  "accessToken": "<소셜 OAuth access token>",
  "confirmReactivation": true
}
```

`access_token`(snake_case)도 동일하게 인정한다.

**응답 200** — 기존과 동일한 로그인 성공 형태 (`accessToken`, `refreshToken`, `user`).

### 유예 기간 밖

소프트 삭제 행이 남아 있으나 **유예가 지난** 경우 **HTTP 403** (`계정 복구 유예 기간이 지났습니다...`).  
이미 물리 삭제된 경우에는 미가입과 동일하게 **`needsSignup: true`** 가 내려갈 수 있다.

### 회원가입 (`POST /auth/signup/*`)

탈퇴 유예 중인 기존 계정이 **같은 소셜로** 가입 API를 호출하는 경우에도 **1차는 `needsReactivation`** 만 반환할 수 있다. 복구 시 **`confirmReactivation: true`** + 소셜 토큰을 보내면 된다.  
`activityName`은 **신규 가입** 시에만 필수(서버 검증).

---

## 네이버 로그인 (`POST /auth/naver`)

**둘 중 하나만** 보내면 됩니다. **`accessToken`이 있으면 그쪽이 우선**합니다 (모바일 + 웹 동시에 넣지 말 것).

### A) 모바일 — `@react-native-seoul/naver-login` 등 (권장)

SDK가 넘겨준 **네이버 OAuth `accessToken`**을 카카오와 같이 보냅니다.

```json
{
  "accessToken": "<네이버 OAuth access token>"
}
```

`access_token`(snake_case)도 동일하게 인정합니다. 서버는 `openapi.naver.com/v1/nid/me`에 `Authorization: Bearer`로 검증 후 자체 JWT를 발급합니다. **이 경로에서는 서버에 Client Secret이 없어도 됩니다** (nid/me 검증만).

### B) 웹 — 인가 **code** 방식

서버가 `nid.naver.com/oauth2.0/token`으로 code를 액세스 토큰으로 교환합니다. 아래 **백엔드 `.env`에 ID·Secret 필요**.

| 용도 | 후보 1 (권장) | 후보 2 | 후보 3 |
|------|----------------|--------|--------|
| Client ID | `OAUTH_NAVER_CLIENT_ID` | `NAVER_CLIENT_ID` | `oauth_naver_client_id` |
| Client Secret | `OAUTH_NAVER_CLIENT_SECRET` | `NAVER_CLIENT_SECRET` | `oauth_naver_client_secret` |

- **시크릿은 앱 번들에 넣지 말 것.** code 교환은 서버만.
- `.env` 수정 후 Nest **재시작** 필요.

**Body**

```json
{
  "code": "<네이버 인가 코드>",
  "redirectUri": "<authorize 시 redirect 와 완전 동일>",
  "redirect_uri": "<위와 동일 (선택)>",
  "state": "<인가에 state 썼을 때만 동일 값>"
}
```

`redirectUri` 또는 `redirect_uri` 중 하나만 있어도 됩니다.  
`code`는 **1회용**이며, `redirectUri` / `redirect_uri`를 둘 다 보내면 **문자열이 완전히 같아야** 합니다.

### 공통 응답

**이미 가입(정상):** `accessToken`, `refreshToken`, `user` (자체 JWT)

**탈퇴 유예 중(복구 확인 전):** `needsReactivation: true`, `deletedAt`, `reactivationDeadline`, `profile`, `user` — **JWT 없음**  
→ 복구 시 같은 엔드포인트에 `confirmReactivation: true` 추가.

**미가입:** `needsSignup`, `profile`, `naverAccessToken`, `oauthAccessToken`(동일 값)  
→ `POST /auth/signup/naver` 의 **`accessToken`에 위 네이버 액세스 토큰**을 넣습니다.

**code 플로우**에도 `confirmReactivation` 을 본문에 넣을 수 있다.

### `POST /auth/signup/naver`

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
| HTTP **400** + `NAVER_CLIENT…` / `OAUTH_NAVER…` / `서버 .env 에 네이버 클라이언트…` | **웹 code 로그인** 시 서버에 ID·Secret이 안 읽힘 → 변수 이름·재시작·배포 env 확인 |
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
| 로그인 | `POST /auth/kakao` — `{ "accessToken" \| "access_token", "confirmReactivation"?: true }` |
| 가입 | `POST /auth/signup/kakao` |

---

## `POST /auth/refresh`

```json
{ "refreshToken": "…" }
```

---

## Swagger

`/api` → **auth** 태그
