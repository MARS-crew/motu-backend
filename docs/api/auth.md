# 인증

[← API 명세서 목차](README.md)

## 로그인

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

## 토큰 재발급

| 항목 | 내용 |
|------|------|
| API | `POST /api/auth/refresh` |
| 로그인 | 불필요 |
| 요청 | `refreshToken` |
| 응답 | `accessToken`, `accessTokenExpiresIn`, `refreshToken` (**새 값으로 바뀜**) |
| 에러 | 401 `AUTH_INVALID_REFRESH_TOKEN`, 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` |

- 사용한 Refresh 토큰은 바로 폐기됩니다. 이미 쓴 토큰을 다시 보내면 탈취로 보고 그 회원의 모든 로그인 세션을 끊습니다.
- 동시에 여러 요청이 401을 받으면 재발급은 한 번만 하고, 나머지 요청은 새 토큰으로 다시 보내 주세요.

## 로그아웃

| 항목 | 내용 |
|------|------|
| API | `POST /api/auth/logout` |
| 로그인 | 불필요 |
| 요청 | `refreshToken` |
| 응답 | `null` |

- 이미 로그아웃된 토큰이어도 성공합니다. 응답과 관계없이 저장한 토큰을 지워 주세요.

## 아이디 찾기

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

## 비밀번호 재설정

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

## 인증번호 공통 규칙

[가입 이메일 인증](users.md#가입-이메일-인증)과 [아이디 찾기](#아이디-찾기)의 인증번호는 같은 규칙입니다.

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
