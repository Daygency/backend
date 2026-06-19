# Review API 명세

## 테이블(`review`) 컬럼

- `rating` (`DISAPPOINTING` | `GOOD` | `IMPRESSED`)
- `disappointment_reason_codes` (`json`, nullable)
  - `rating=DISAPPOINTING`일 때만 사용
  - 값 목록:
    - `TIME_NOT_KEPT`
    - `COMMUNICATION`
    - `RESPONSE_LATE_OR_UNCLEAR`
    - `INSUFFICIENT_PREP`
    - `UNCOMFORTABLE_PROCESS`
    - `REQUESTS_NOT_REFLECTED`
    - `PROBLEM_RESPONSE_WEAK`
- `private_note_to_ops` (`text`, nullable)
  - 운영팀 개선용 메모
  - 상대방에게 전달되지 않음
- `positive_reason_codes` (`json`, nullable)
  - `rating=GOOD` 또는 `rating=IMPRESSED`일 때 사용
  - 값 목록:
    - `TIME_WELL_KEPT`
    - `FLEXIBLE_ON_SCHEDULE_CHANGE`
    - `SMOOTH_COMMUNICATION`
    - `FAST_AND_CLEAR_RESPONSE`
    - `WELL_PREPARED`
    - `COMFORTABLE_COLLABORATION`
    - `POLITE_AND_CONSIDERATE`
    - `CALM_PROBLEM_SOLVING`
- `public_note` (`text`, nullable)
  - `GOOD`/`IMPRESSED`일 때 공개되는 후기 본문 텍스트
  - 후기 목록 조회 응답에 포함

## 후기 작성

- `POST /announcement/:postId/reviews`
- Body

```json
{
  "revieweeUserId": "550e8400-e29b-41d4-a716-446655440111",
  "rating": "GOOD",
  "positiveReasonCodes": ["SMOOTH_COMMUNICATION", "WELL_PREPARED"],
  "publicNote": "덕분에 연주가 정말 편안하고 즐거웠습니다."
}
```

### nullable 사용 예시

- `disappointmentReasonCodes: null` 가능
- `privateNoteToOps: null` 가능
- `positiveReasonCodes: null` 가능
- `publicNote: null` 가능
- 둘 다 미전송 가능

```json
{
  "revieweeUserId": "550e8400-e29b-41d4-a716-446655440111",
  "rating": "DISAPPOINTING",
  "disappointmentReasonCodes": null,
  "privateNoteToOps": null,
  "positiveReasonCodes": null,
  "publicNote": null
}
```

## 후기 수정

- `PATCH /reviews/:reviewId`
- Body (수정 필드만 전송)

```json
{
  "positiveReasonCodes": ["POLITE_AND_CONSIDERATE", "CALM_PROBLEM_SOLVING"],
  "publicNote": "진행이 매우 안정적이었고 배려가 느껴졌습니다."
}
```

## 유효성 규칙

- `rating !== DISAPPOINTING`인 경우:
  - `disappointmentReasonCodes` 값 전달 불가
  - `privateNoteToOps` 값 전달 불가
- `rating === DISAPPOINTING`인 경우:
  - `positiveReasonCodes` 값 전달 불가
  - `publicNote` 값 전달 불가
- `privateNoteToOps` 최대 길이: 2000
- `publicNote` 최대 길이: 2000
