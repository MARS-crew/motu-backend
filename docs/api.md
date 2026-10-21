# MOTU API 명세서

화면별로 필요한 API와 실패했을 때의 처리 방법을 정리한 문서입니다. 필드 타입과 예시는 Swagger(`/api/docs`)에서 직접 호출해 볼 수 있고, 이 문서는 Swagger만으로는 알기 어려운 **화면 연결, 동작 규칙, 에러 처리**를 중심으로 적습니다.

- 화면 ID는 화면설계서 기준입니다. (인증 화면 USR-AUTH는 `모투화면설계서.pptx`, 나머지는 `[1차 개발]모투화면설계서.pptx`)
- API를 바꾸는 PR에서는 이 문서도 같이 고칩니다.

## 목차

1. [공통](#1-공통)
2. [인증](#2-인증)
3. [회원가입·회원](#3-회원가입회원)
4. [계좌·포인트](#4-계좌포인트)
5. [상품](#5-상품)
6. [검색](#6-검색)
7. [관심상품](#7-관심상품)
8. [관리자](#8-관리자)
9. [아직 구현되지 않은 것](#9-아직-구현되지-않은-것)

---

## 1. 공통

### 1.1 주소

| 환경 | 주소 |
|------|------|
| 로컬 | `http://localhost:3000/api` |
| Swagger | `{주소}/api/docs` |

### 1.2 응답 형식

모든 응답은 아래 두 형식 중 하나입니다.

```json
// 성공
{ "success": true, "data": { } }

// 실패
{ "success": false, "error": { "code": "EMAIL_DUPLICATED", "message": "이미 가입된 이메일입니다.", "details": { } } }
```

- 화면 분기는 `error.code`로 합니다. `message`는 사용자에게 그대로 보여줘도 되는 한글 문구입니다.
- `details`는 있을 때만 옵니다. (예: 로그인 실패 횟수, 인증번호 남은 횟수)
- 요청 값 검증에 실패하면 `code: "BAD_REQUEST"`, `message: "요청 값이 올바르지 않습니다."`이고, 항목별 한글 문구가 `details` 배열로 옵니다.

  ```json
  { "code": "BAD_REQUEST", "message": "요청 값이 올바르지 않습니다.", "details": ["검색어는 50자 이하로 입력해 주세요."] }
  ```

- 204(No Content) 응답은 본문이 없습니다.
- 예상하지 못한 서버 오류는 500 `INTERNAL_SERVER_ERROR` "서버 내부 오류가 발생했습니다."입니다. "잠시 후 다시 시도해 주세요" 같은 공통 안내를 보여 주세요.

### 1.3 인증

API마다 아래 넷 중 하나입니다. 각 API 표의 **로그인** 칸에 적었습니다.

| 표시 | 뜻 |
|------|------|
| 불필요 | 토큰 없이 호출합니다. 토큰을 보내도 읽지 않습니다. |
| 선택 | 토큰 없이도 호출할 수 있고, 토큰을 보내면 회원으로 처리합니다. (관심 여부, 최근 검색어 등) **로그인 상태라면 꼭 토큰을 보내 주세요.** |
| 필요 | 토큰이 있어야 합니다. 없으면 401 `AUTH_UNAUTHORIZED`입니다. |
| 관리자 | 관리자 토큰이 있어야 합니다. 일반 회원이면 403 `AUTH_FORBIDDEN`입니다. |

- 토큰은 `Authorization: Bearer <accessToken>` 헤더로 보냅니다.
- Access 토큰은 15분, Refresh 토큰은 14일 동안 유효합니다.

#### 토큰·계정 상태 에러 처리

| 응답 | 상황 | 프론트 처리 |
|------|------|------|
| 401 `AUTH_TOKEN_EXPIRED` | Access 토큰 만료 | `POST /api/auth/refresh`로 재발급하고 원래 요청을 다시 보냅니다. Refresh 토큰도 응답의 새 값으로 바꿔 저장합니다. |
| 401 `AUTH_INVALID_REFRESH_TOKEN` | 재발급 실패 (만료, 이미 사용, 로그아웃됨) | 저장한 토큰을 지우고 로그인 화면으로 보냅니다. 비회원도 볼 수 있는 화면(로그인 "선택")은 토큰 없이 다시 호출하면 됩니다. |
| 401 `AUTH_UNAUTHORIZED` | 토큰이 없거나 잘못됨 | 로그인이 필요한 기능이면 로그인 유도 모달(USR-AUTH-000)을 띄웁니다. |
| 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` | 로그인 중에 계정이 잠기거나 정지됨 (모든 API에서 올 수 있음) | 로그아웃하고 로그인 화면의 잠금 안내(USR-AUTH-001-M01)로 보냅니다. |
| 403 `AUTH_FORBIDDEN` | 관리자 API를 일반 회원이 호출 | 접근 권한 없음 안내 |

> 로그인 "선택" API에서 토큰이 만료되면 비회원으로 처리하지 않고 401 `AUTH_TOKEN_EXPIRED`를 돌려줍니다. 로그인한 사람에게 하트가 꺼진 화면이 잠깐 보이는 일을 막기 위해서입니다.

### 1.4 페이지네이션

목록 API는 **커서 방식**입니다. (포인트 이력만 페이지 번호 방식)

| 요청 | 설명 |
|------|------|
| `cursor` | 첫 페이지는 비우고, 다음 페이지는 이전 응답의 `nextCursor`를 그대로 넘깁니다. |
| `size` | 한 페이지 건수. 기본 20, 최대 50 |

| 응답 | 설명 |
|------|------|
| `items` | 목록 |
| `nextCursor` | 다음 페이지 커서. 마지막 페이지면 `null` |

- 정렬이나 필터(카테고리 등)를 바꾸면 커서 없이 처음부터 다시 불러와 주세요. 정렬이 다른 커서를 넘기면 400 `STOCK_INVALID_CURSOR` "목록을 처음부터 다시 불러와 주세요."입니다.

### 1.5 값 형식

| 항목 | 형식 |
|------|------|
| 시각 | ISO 8601 UTC 문자열 (예: `2026-10-21T01:00:00.000Z`). 화면에는 한국 시간으로 바꿔 표시합니다. |
| 날짜 | `YYYY-MM-DD` 문자열 (생년월일, 지표 집계 기간) |
| 포인트·금액 | 숫자 (P 단위, 소수점 없음) |

### 1.6 메일 발송 실패

메일 서비스 장애로 인증번호 메일을 보내지 못하면 503 `MAIL_SEND_FAILED` "메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요."입니다. 이 경우 재발송 제한(30초)이 걸리지 않으므로 바로 다시 요청할 수 있습니다.

---

## 2. 인증

### 2.1 로그인

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-001, 001-E01, 001-M01 |
| API | `POST /api/auth/login` |
| 로그인 | 불필요 |
| 요청 | `loginId`, `password` |
| 응답 | `accessToken`, `accessTokenExpiresIn`(초), `refreshToken`, `user { userId, loginId, nickname, role }` |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 401 `AUTH_INVALID_CREDENTIALS` + `details { failCount, maxFailCount }` | 비밀번호 1~4회 틀림 | 실패 상태 표시, "실패 횟수 `failCount`/`maxFailCount`" |
| 401 `AUTH_INVALID_CREDENTIALS` (details 없음) | 없는 아이디 | 횟수 없이 "아이디 또는 비밀번호를 확인해 주세요."만 표시 |
| 403 `AUTH_ACCOUNT_LOCKED` | 5회째 틀림, 또는 이미 잠긴 계정 | 계정 잠금 상태로 전환 (문의하기 안내) |
| 403 `AUTH_ACCOUNT_BLOCKED` | 정지된 계정 | 정지 안내 (문의하기 안내) |

- 로그인에 성공하면 실패 횟수는 0으로 초기화됩니다.
- 잠긴 계정은 비밀번호 재설정으로 풀리지 않습니다.

### 2.2 토큰 재발급

| 항목 | 내용 |
|------|------|
| API | `POST /api/auth/refresh` |
| 로그인 | 불필요 |
| 요청 | `refreshToken` |
| 응답 | `accessToken`, `accessTokenExpiresIn`, `refreshToken` (**새 값으로 바뀜**) |
| 에러 | 401 `AUTH_INVALID_REFRESH_TOKEN`, 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` |

- 사용한 Refresh 토큰은 바로 폐기됩니다. 이미 쓴 토큰을 다시 보내면 탈취로 보고 그 회원의 모든 로그인 세션을 끊습니다.
- 동시에 여러 요청이 401을 받으면 재발급은 한 번만 하고, 나머지 요청은 새 토큰으로 다시 보내 주세요.

### 2.3 로그아웃

| 항목 | 내용 |
|------|------|
| API | `POST /api/auth/logout` |
| 로그인 | 불필요 |
| 요청 | `refreshToken` |
| 응답 | `null` |

- 이미 로그아웃된 토큰이어도 성공합니다. 응답과 관계없이 저장한 토큰을 지워 주세요.

### 2.4 아이디 찾기

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-006 |
| 로그인 | 불필요 |

| 단계 | API | 요청 | 응답 |
|------|------|------|------|
| 인증번호 발송 | `POST /api/auth/find-login-id/email-verifications` | `email` | `expiresAt`, `resendAvailableAt` |
| 인증번호 확인 | `POST /api/auth/find-login-id/email-verifications/confirm` | `email`, `code`(6자리) | `maskedLoginId` (예: `min***01`) |

| 에러 | 상황 |
|------|------|
| 404 `AUTH_EMAIL_NOT_REGISTERED` | 가입되지 않은 이메일 (화면에 실패 사유 표시) |
| [인증번호 공통 에러](#인증번호-공통-규칙) | 오입력, 만료, 재발송 제한 등 |
| 503 `MAIL_SEND_FAILED` | 메일 발송 실패 |

- 잠긴·정지된 계정도 아이디 찾기는 할 수 있습니다.
- 인증 결과는 한 번만 쓸 수 있습니다. 아이디를 다시 보려면 인증번호부터 다시 받아야 합니다.

### 2.5 비밀번호 재설정

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-007 (요청), USR-AUTH-008 (새 비밀번호) |
| 로그인 | 불필요 |

| 단계 | API | 요청 | 응답 |
|------|------|------|------|
| 재설정 링크 발송 | `POST /api/auth/password-reset` | `loginId`, `email` | `null` |
| 링크 확인 (새 비밀번호 화면 진입 시) | `POST /api/auth/password-reset/verify` | `token` (링크의 `?token=` 값) | `valid: true` |
| 새 비밀번호 설정 | `POST /api/auth/password-reset/confirm` | `token`, `newPassword` | `null` |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 400 `AUTH_INVALID_PASSWORD_RESET_TOKEN` | 만료(30분), 이미 사용, 새 링크 발급으로 무효 | "링크가 만료되었거나 이미 사용되었습니다" 안내 후 재설정 요청 화면으로 |
| 400 `AUTH_SAME_AS_CURRENT_PASSWORD` | 현재 비밀번호와 같음 | 입력칸 아래에 문구 표시. **같은 링크로 바로 다시 시도할 수 있습니다.** |
| 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` | 링크를 받은 뒤 계정이 잠기거나 정지됨 | 잠금·정지 안내 |

- **링크 발송은 항상 성공 응답입니다.** 아이디·이메일이 맞지 않거나, 잠긴 계정이거나, 1분 안에 다시 요청했거나, 메일 발송에 실패해도 같은 응답입니다. 가입 여부를 드러내지 않기 위해서입니다. 화면은 항상 "이메일을 확인해 주세요" 안내를 보여 주면 됩니다.
- 새 링크를 보내면 이전 링크는 쓸 수 없습니다.
- 비밀번호를 바꾸면 모든 기기에서 로그아웃됩니다. 완료 후 로그인 화면으로 보내 주세요.
- 새 비밀번호 확인값 일치 여부는 프론트에서 확인합니다. (서버는 `newPassword` 하나만 받음)

### 인증번호 공통 규칙

회원가입(3.3)과 아이디 찾기(2.4)의 인증번호는 같은 규칙입니다.

| 규칙 | 값 |
|------|------|
| 길이 | 6자리 숫자 |
| 유효시간 | 5분 (`expiresAt`) |
| 재발송 제한 | 발송에 **성공한** 뒤 30초 (`resendAvailableAt`) |
| 재발송 시 번호 | 유효시간이 1분 이상 남았으면 **같은 번호**를 다시 보냄 (만료 시각·시도 횟수 유지). 아니면 새 번호 발급 |
| 입력 횟수 | 번호당 5회 |
| 인증 결과 유효시간 | 인증 성공 후 30분 안에 다음 단계(회원가입 등)를 마쳐야 함 |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 400 `VERIFICATION_CODE_MISMATCH` + `details { remainingAttempts }` | 오입력 | 오류 문구와 남은 횟수 표시 |
| 429 `VERIFICATION_ATTEMPTS_EXCEEDED` | 5회 초과 | "인증번호를 다시 받아 주세요" + 재발송 버튼 |
| 400 `VERIFICATION_EXPIRED` | 5분 지남 | 재발송 안내 |
| 404 `VERIFICATION_NOT_FOUND` | 인증번호를 요청하지 않고 확인 | 인증번호 발송부터 |
| 429 `VERIFICATION_RESEND_TOO_SOON` | 30초 안에 재발송 | `resendAvailableAt`까지 재발송 버튼 비활성화 |
| 503 `MAIL_SEND_FAILED` | 메일 발송 실패 | 잠시 후 다시 시도 안내 (재발송 제한 없음) |

---

## 3. 회원가입·회원

### 3.1 아이디·닉네임 중복 확인

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-003, 003-M01 |
| API | `GET /api/users/login-id/availability?loginId=` / `GET /api/users/nickname/availability?nickname=` |
| 로그인 | 불필요 |
| 응답 | `available` (true면 사용 가능) |
| 에러 | 400 형식 오류 (아이디 5~20자 영문 소문자·숫자, 닉네임 2~10자 한글·영문·숫자) |

### 3.2 회원가입 순서

1. 약관 동의 (USR-AUTH-002) — 프론트에서만 처리
2. 기본 정보 입력, 아이디·닉네임 중복 확인 (3.1)
3. 가입 이메일 인증 (3.3)
4. 회원가입 (3.4)

### 3.3 가입 이메일 인증

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-004 |
| 로그인 | 불필요 |

| 단계 | API | 요청 | 응답 |
|------|------|------|------|
| 인증번호 발송 | `POST /api/users/email-verifications` | `email` | `expiresAt`, `resendAvailableAt` |
| 인증번호 확인 | `POST /api/users/email-verifications/confirm` | `email`, `code` | `verified: true` |

| 에러 | 상황 |
|------|------|
| 409 `EMAIL_DUPLICATED` | 이미 가입된 이메일 |
| [인증번호 공통 에러](#인증번호-공통-규칙) | |

- 발송 성공 화면의 "사용 가능한 이메일입니다."는 발송 API가 성공했다는 뜻으로 표시하면 됩니다.

### 3.4 회원가입

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-003 ~ 005 |
| API | `POST /api/users` |
| 로그인 | 불필요 |
| 요청 | `loginId`, `password`, `nickname`, `email`(인증 완료한 이메일), `phoneNumber`(선택, 하이픈 유무 무관), `birthDate`(`YYYY-MM-DD`), `termsAgreed`(true 필수), `privacyAgreed`(true 필수), `marketingAgreed` |
| 응답 | `userId`, `loginId`, `nickname`, `userStatus`(`ACTIVE`), `role`(`USER`), `cash`(3,000,000) |

| 에러 | 상황 |
|------|------|
| 400 `VERIFICATION_REQUIRED` | 이메일 인증을 안 했거나 인증 후 30분이 지남 → 이메일 인증 단계로 |
| 409 `LOGIN_ID_DUPLICATED` / `NICKNAME_DUPLICATED` / `EMAIL_DUPLICATED` | 중복 확인 후 다른 사람이 먼저 가입함 |
| 409 `USER_DUPLICATED` | 동시에 가입해 어떤 값이 중복인지 알 수 없음 |
| 400 `BAD_REQUEST` | 형식 오류. 생년월일이 오늘(한국 시간) 이후면 "생년월일은 오늘 이후 날짜로 입력할 수 없습니다." |

- 비밀번호 확인값 일치 여부는 프론트에서 확인합니다.
- 가입하면 계좌가 만들어지고 초기 포인트 3,000,000P가 지급됩니다. 가입 후 로그인 화면으로 보냅니다. (자동 로그인 없음)

### 3.5 내 정보

| 항목 | 내용 |
|------|------|
| API | `GET /api/users/me` |
| 로그인 | 필요 |
| 응답 | `userId`, `loginId`, `nickname`, `email`, `phoneNumber`(null 가능), `role`, `userStatus` |

---

## 4. 계좌·포인트

화면 USR-ASSET-01, 02-01, 02-02. 모두 **로그인 필요**입니다.

### 4.1 내 계좌 (자산관리)

| 항목 | 내용 |
|------|------|
| 화면 | USR-ASSET-01 |
| API | `GET /api/accounts/me` |
| 응답 | `cash`(보유 포인트 = 예수금, 주문 예약분 포함), `lockedCash`(매수 주문에 예약된 포인트), `availableCash`(사용 가능 포인트 = `cash - lockedCash`) |

- 자산관리 화면의 "보유 포인트"에는 `cash`를 표시합니다. (기획 확인)
- 매수 주문 화면의 "사용 가능 포인트"에는 `availableCash`를 씁니다.

### 4.2 포인트 변경 이력

| 항목 | 내용 |
|------|------|
| API | `GET /api/accounts/me/ledgers?page=&size=` |
| 페이지 | 페이지 번호 방식. `page` 1부터, `size` 기본 20, 최대 100 |
| 응답 | `items[] { ledgerId, type, amount, balanceBefore, balanceAfter, createDate }`, `page`, `size`, `totalCount` |

| `type` | 뜻 |
|------|------|
| `DEPOSIT` | 초기 지급 (회원가입) |
| `GRANT` | 추가 포인트 지급 |
| `RESET` | 포인트 리셋 |
| `ADJUST` | 관리자 조정 |
| `BUY` / `SELL` | 매수 / 매도 (주문 작업 후) |

### 4.3 추가 포인트 지급

| 항목 | 내용 |
|------|------|
| 화면 | USR-ASSET-02-01 |

| 단계 | API | 응답 |
|------|------|------|
| 지급 가능 여부 | `GET /api/accounts/me/point-grant` | `cash`, `amount`(100,000), `available`, `nextAvailableAt`(지금 가능하면 null), `remainingSeconds`(지금 가능하면 0), `lastGrantedAt` |
| 지급 | `POST /api/accounts/me/point-grant` | `amount`, `cashBefore`, `cashAfter`, `grantedAt`, `nextAvailableAt` |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `POINT_GRANT_TOO_SOON` + `details { nextAvailableAt }` | 마지막 지급 후 24시간 전 | 버튼 비활성화, "남은 시간 n시간 n분" |
| 409 `ACCOUNT_CONCURRENT_UPDATE` | 동시에 여러 번 눌림 | 상태를 다시 조회. **요청 중에는 버튼을 비활성화해 주세요.** |

- 화면 진입 시 `GET`으로 상태를 받아 버튼 활성화와 남은 시간을 정합니다.
- 남은 시간은 `remainingSeconds`(서버 시각 기준)로 계산하면 기기 시계가 틀려도 맞게 나옵니다.
- 리셋해도 24시간 대기는 유지됩니다.

### 4.4 포인트 리셋

| 항목 | 내용 |
|------|------|
| 화면 | USR-ASSET-02-02 |

| 단계 | API | 응답 |
|------|------|------|
| 리셋 가능 여부 | `GET /api/accounts/me/point-reset` | `resetCash`(3,000,000), `cash`, `available`, `reason`(리셋 불가 사유, 가능하면 null), `conditions[] { condition, met }`, `nextAvailableAt`, `remainingSeconds` |
| 리셋 | `POST /api/accounts/me/point-reset` | `cashBefore`, `cashAfter`, `resetAt`, `nextAvailableAt` |

리셋 조건 (화면 순서, 모두 충족해야 함)

| `condition` | 조건 | 불가 사유 (`reason`) |
|------|------|------|
| (보유 종목 테이블 생기면 추가) | 보유 종목 0개 | 현재 보유 중인 종목이 존재해 리셋이 불가능합니다. |
| `NO_LOCKED_CASH` | 미체결 주문 없음 (= 예약 포인트 0P = 처리 중 거래 없음) | 현재 미체결 주문이 존재해 리셋이 불가능합니다. |
| `CASH_BELOW_LIMIT` | 보유 포인트 300,000P 미만 | 보유 포인트가 리셋 가능 기준(300,000P) 이상입니다. |
| `RESET_INTERVAL_PASSED` | 마지막 리셋 후 7일 경과 (리셋한 적 없으면 충족) | 마지막 리셋으로부터 7일이 지난 후 다시 시도해 주세요. |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `POINT_RESET_NOT_ALLOWED` + `details { conditions }` | 조건 미충족 | `message`(첫 번째 사유) 표시 |
| 409 `ACCOUNT_CONCURRENT_UPDATE` | 동시에 여러 번 눌림 | 상태를 다시 조회 |

- 사유는 충족하지 못한 조건 중 화면 순서상 **첫 번째 하나**만 내려줍니다.
- 7일 조건에는 프론트가 `remainingSeconds`로 "n일 n시간 nn분"을 붙여 표시합니다.
- 리셋 전 확인 모달(복구 불가 안내)은 프론트에서 띄웁니다.
- 리셋하면 거래내역은 삭제되고(주문 작업 후), 관심상품과 포인트 이력은 유지됩니다.

---

## 5. 상품

현재가·등락률·거래량·거래대금은 [아직 실제 값이 아닙니다](#9-아직-구현되지-않은-것).

### 상품 목록 항목 (공통)

목록, 검색, 신규 상장, 최근 본 종목, 관심 상품 목록이 모두 이 형식입니다.

| 필드 | 설명 |
|------|------|
| `stockId`, `stockCode`, `name` | 상품 ID, 종목 코드, 상품명 |
| `sectorCode`, `sectorName` | 카테고리 |
| `logoImageUrl` | 로고 (null이면 기본 이미지) |
| `currentPrice` | 현재가 (P) |
| `changeAmount`, `changeRate` | 전일 대비 변동 금액(P), 등락률(%) |
| `volume`, `tradeAmount` | 당일 거래량(주), 거래대금(P) |
| `listingDate` | 상장일 |
| `tradeStatus` | `PENDING` 거래 대기 / `ACTIVE` 거래 가능 / `PAUSED` 거래 중지 / `CLOSED` 거래 종료 |
| `isWishlisted` | 관심상품 여부 (비회원은 false) |

- 거래 대기·중지·종료 상품도 목록에 나옵니다. (기획 문의 중) 삭제된 상품만 빠집니다.

### 5.1 카테고리

| 항목 | 내용 |
|------|------|
| 화면 | USR-MARKET-01 (카테고리 버튼) |
| API | `GET /api/sectors` |
| 로그인 | 불필요 |
| 응답 | `items[] { sectorCode, sectorName }` — 9개, 코드순 (SaaS/소프트웨어, AI/데이터, 핀테크, 커머스/유통, 콘텐츠/미디어, 헬스케어, 교육, 모빌리티, 기타) |

### 5.2 상품 목록 (마켓)

| 항목 | 내용 |
|------|------|
| 화면 | USR-MARKET-01 |
| API | `GET /api/stocks?sectorCode=&sort=&cursor=&size=` |
| 로그인 | 선택 (관심 여부) |
| 요청 | `sectorCode`(비우면 전체), `sort`, [커서](#14-페이지네이션) |
| 응답 | `items[]`(상품 목록 항목), `nextCursor` |

| `sort` | 정렬 |
|------|------|
| `TRADE_AMOUNT` (기본) | 거래대금 많은순 |
| `CHANGE_RATE_DESC` | 등락률 높은순 |
| `CHANGE_RATE_ASC` | 등락률 낮은순 |
| `VOLUME` | 거래량 많은순 |
| `LISTING_DATE` | 최근 상장순 |

- 시세 값이 생기기 전까지는 모든 정렬이 최근 상장순으로 동작합니다.
- 결과가 없으면 빈 배열입니다.

### 5.3 신규 상장

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01 (3개), USR-HOME-01-05 (전체) |
| API | `GET /api/stocks/new-listings?cursor=&size=` |
| 로그인 | 선택 (관심 여부) |
| 응답 | `items[]`(상품 목록 항목 + `summary` 한 줄 소개, `isNew` 상장 후 7일 이내), `nextCursor` |

- 홈 화면은 `size=3`으로 호출합니다. 최근 상장순입니다.

### 5.4 상품 상세

| 항목 | 내용 |
|------|------|
| 화면 | USR-MARKET-02-01 (상단 종목 정보), USR-MARKET-02-03 (종목정보 탭) |
| API | `GET /api/stocks/:stockId` |
| 로그인 | 선택 (관심 여부, 최근 본 종목 기록) |

| 응답 필드 | 설명 |
|------|------|
| `stockId`, `stockCode`, `name` | |
| `summary` | 한 줄 소개 (상품명 아래) |
| `description` | 상품 소개 (종목정보 탭, null 가능) |
| `sectorCode`, `sectorName` | 카테고리 |
| `logoImageUrl`, `mainImageUrl` | 로고(null 가능), 대표 이미지 |
| `officialUrl` | 공식 URL (null 가능) |
| `operatorName` | 운영사 |
| `metrics` | 주요 서비스 지표 `{ mau, dau, revenue, transactionVolume, startDate, endDate }` — 값이 없으면 각각 null |
| `listingDate`, `tradeStatus` | 상장일, 거래 상태 |
| `currentPrice`, `changeAmount`, `changeRate` | 현재가, 전일 대비 |
| `isWishlisted` | 관심상품 여부 |

| 에러 | 상황 |
|------|------|
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |
| 400 `BAD_REQUEST` | `stockId`가 숫자가 아님 |

- 지표나 정보 값이 null이면 화면에 "정보없음"을 표시합니다.
- 지표는 상장 신청에서 입력한 MAU, DAU, 연간 매출(원), 거래액(원), 집계 기간입니다. (화면 예시의 누적 가입자·평균 수익률은 받지 않음)
- 거래 대기·중지·종료 상품은 매수·매도 버튼을 비활성화합니다. (SRS No.12)
- 호가·차트·체결 탭은 [아직 구현 전](#9-아직-구현되지-않은-것)입니다.

### 5.5 최근 본 종목

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01 |
| API | `GET /api/stocks/recently-viewed` |
| 로그인 | 필요 (홈에서 비회원이면 호출하지 않고 빈 상태 표시) |
| 응답 | `items[]`(상품 목록 항목), 최근 본 순서, 최대 3개 |

- 로그인한 상태로 상품 상세(5.4)를 조회할 때 기록됩니다. 같은 상품을 다시 보면 맨 위로 올라갑니다.
- 최근 본 상품이 삭제되면 그 자리가 비어 3개보다 적게 나올 수 있습니다.

---

## 6. 검색

### 6.1 상품 검색

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01-01 |
| API | `GET /api/stocks/search?keyword=&cursor=&size=` |
| 로그인 | 선택 (관심 여부, 최근 검색어 저장) |
| 요청 | `keyword`(1~50자, 앞뒤 공백 제거), [커서](#14-페이지네이션) |
| 응답 | `items[]`(상품 목록 항목), `nextCursor` |

| 에러 | 상황 |
|------|------|
| 400 "검색어를 입력해 주세요." | 빈 검색어, 공백만 입력 |
| 400 "검색어는 50자 이하로 입력해 주세요." | 50자 초과 |

- 상품명·카테고리명 **부분 일치**이며 영문 대소문자를 구분하지 않습니다.
- 로그인 상태면 첫 페이지 조회 때 최근 검색어에 저장됩니다. (다음 페이지 조회 때는 저장하지 않음)

### 6.2 최근 검색어

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01-01 |
| 로그인 | 필요 (비회원이면 호출하지 않고 빈 상태 표시) |

| 기능 | API | 응답 |
|------|------|------|
| 조회 | `GET /api/search-histories` | `items[] { searchHistoryId, keyword, searchedAt }`, 최근 검색순, 최대 5개 |
| 개별 삭제 | `DELETE /api/search-histories/:searchHistoryId` | 204 |
| 전체 삭제 | `DELETE /api/search-histories` | 204 |

| 에러 | 상황 |
|------|------|
| 404 `SEARCH_HISTORY_NOT_FOUND` | 이미 삭제된 검색어 (목록을 다시 조회) |

- 같은 검색어를 다시 검색하면 새로 추가되지 않고 맨 위로 올라갑니다. 5개를 넘으면 오래된 것부터 지워집니다.

---

## 7. 관심상품

화면 USR-HOME-01-06 (관심 상품 목록), 목록·상세·신규 상장의 하트 버튼. 모두 **로그인 필요**입니다. 비회원이 하트를 누르면 API를 호출하지 않고 로그인 유도 모달(USR-AUTH-000)을 띄웁니다.

| 기능 | API | 응답 |
|------|------|------|
| 등록 | `PUT /api/wishlists/:stockId` | 204 |
| 해제 | `DELETE /api/wishlists/:stockId` | 204 |
| 목록 | `GET /api/wishlists?cursor=&size=` | `items[]`(상품 목록 항목, `isWishlisted`는 모두 true), `nextCursor` |

| 에러 | 상황 |
|------|------|
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품을 등록 |

- 등록·해제는 여러 번 호출해도 결과가 같습니다. 이미 등록된 상품을 다시 등록하거나, 등록되지 않은 상품을 해제해도 204입니다.
- 목록은 최근에 추가한 순서입니다. 삭제된 상품은 빠지고, 거래 종료 상품은 그대로 보입니다.
- 포인트 리셋을 해도 관심상품은 유지됩니다.

---

## 8. 관리자

모두 **관리자** 토큰이 필요합니다. 테스트 계정은 `motuadmin`입니다. 관리자 화면은 2차 개발 예정이고, 지금은 테스트용으로 씁니다.

| 기능 | API | 요청 | 응답 |
|------|------|------|------|
| 회원 계좌 조회 | `GET /api/admin/accounts/:userId` | | `userId`, `cash`, `lockedCash`, `availableCash`, `lastPointGrantAt`, `lastPointResetAt` |
| 회원 포인트 이력 | `GET /api/admin/accounts/:userId/ledgers?page=&size=` | | [4.2](#42-포인트-변경-이력)와 같음 |
| 포인트 지급·차감 | `PATCH /api/admin/accounts/:userId/cash` | `amount` (양수 지급, 음수 차감, ±100,000,000 이내, 0 불가) | `amount`, `cashBefore`, `cashAfter` |
| 대기시간 초기화 | `DELETE /api/admin/accounts/:userId/cooldowns/:type` | `type`: `grant`(24시간) / `reset`(7일) | 204 |

| 에러 | 상황 |
|------|------|
| 404 `ACCOUNT_NOT_FOUND` | 없는 회원 |
| 400 `ACCOUNT_INSUFFICIENT_CASH` | 사용 가능 포인트보다 많이 차감 |
| 403 `AUTH_FORBIDDEN` | 관리자가 아님 |

- 리셋을 테스트하려면 포인트를 300,000P 미만으로 차감한 뒤 리셋을 호출합니다.

---

## 9. 아직 구현되지 않은 것

| 항목 | 현재 동작 | 예정 |
|------|------|------|
| 시세 값 (현재가, 전일 대비, 거래량, 거래대금) | 현재가 = 기준가, 나머지 0, 모든 정렬이 최근 상장순 | 체결 작업 후 실제 값과 정렬 반영 |
| 호가·차트·체결 내역, 주문 | 없음 | 주문·체결 작업 |
| 포인트 리셋: 보유 종목 조건, 거래내역 삭제 | 없음 | 주문·보유 테이블 생성 후 |
| 거래내역·포트폴리오 | 없음 | 주문·체결 작업 후 |
| 새 기기 확인, 2차 보안(SMS) | 없음 | SMS 서비스 확정 후 |
| 회원 탈퇴, 비밀번호 재설정 메일의 화면 주소 | 없음 / 로컬 주소 | 2차 개발 |
