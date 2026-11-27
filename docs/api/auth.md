# 인증

[← API 명세서 목차](README.md)

## 로그인

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-001, 001-E01, 001-M01 |
| API | `POST /api/auth/login` |
| 로그인 | 불필요 |
| 요청 | `loginId`, `password`, `deviceId`(선택, [새 기기 확인](#새-기기-확인)) |
| 응답 | `verificationRequired: false`, `accessToken`, `accessTokenExpiresIn`(초), `refreshToken`, `passwordChangeRequired`(관리자만), `user { userId, loginId, nickname, role }`. 관리자의 `nickname`은 관리자명(없으면 닉네임, 그것도 없으면 아이디) |
| 응답 (새 기기) | `verificationRequired: true`, `loginToken`, `loginTokenExpiresIn`(초), `method`(`EMAIL`/`SMS`), `maskedTarget` → [새 기기 확인](#새-기기-확인)으로 |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 401 `AUTH_INVALID_CREDENTIALS` + `details { failCount, maxFailCount }` | 비밀번호 1~4회 틀림 | 실패 상태 표시, "실패 횟수 `failCount`/`maxFailCount`" |
| 401 `AUTH_INVALID_CREDENTIALS` (details 없음) | 없는 아이디 | 횟수 없이 "아이디 또는 비밀번호를 확인해 주세요."만 표시 |
| 403 `AUTH_ACCOUNT_LOCKED` | 5회째 틀림, 또는 이미 잠긴 계정 | 계정 잠금 상태로 전환 (문의하기 안내) |
| 403 `AUTH_ACCOUNT_BLOCKED` | 정지된 계정 | 정지 안내 (문의하기 안내) |

- 로그인에 성공하면 실패 횟수는 0으로 초기화됩니다. 새 기기 확인이 필요하면 확인을 마칠 때 초기화합니다.
- 관리자 로그인이면 `passwordChangeRequired`를 함께 내려줍니다. `true`면 임시 비밀번호 상태이므로 바로 [관리자 비밀번호 변경](admin-accounts.md) 화면으로 보냅니다. 회원 로그인에는 이 필드가 없습니다.
- 잠긴 계정은 비밀번호 재설정으로 풀리지 않습니다.
- 관리자 계정 아이디로 들어온 로그인은 성공·실패를 [관리자 접속 이력](admin-accounts.md#관리자-접속-이력)에 남깁니다. 응답은 회원 로그인과 같습니다.
- 잠금·정지 계정은 일반 로그인 대신 [제한 계정 1:1 문의](inquiries.md)의 본인 확인 API로 문의 전용 토큰을 받아 문의를 접수할 수 있습니다. 일반 로그인 토큰을 발급하거나 계정을 해제하지 않습니다.

## 새 기기 확인

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-001-S02 (2차 보안 미설정, 이메일), USR-AUTH-009 (2차 보안 설정, SMS) |
| API | ① `POST /api/auth/login/verifications` ② `POST /api/auth/login/verifications/confirm` |
| 로그인 | 불필요 (`loginToken` 사용) |
| 요청 | ① `loginToken` ② `loginToken`, `code` |
| 응답 | ① `method`, `maskedTarget`, `expiresAt`, `resendAvailableAt`, `remainingAttempts`(SMS만, EMAIL은 null) ② [로그인](#로그인) 성공 응답과 같음 |

**흐름**
1. 앱·웹은 처음 실행할 때 UUID를 하나 만들어 저장해 두고, 로그인할 때마다 `deviceId`로 같은 값을 보냅니다.
2. 비밀번호가 맞아도 신뢰하지 않은 기기면 토큰 대신 `verificationRequired: true`와 `loginToken`(10분)을 받습니다. 기본 로그인 화면에는 기기 정보를 보여 주지 않습니다.
3. `method`에 따라 추가 확인 화면을 띄웁니다.
   - `EMAIL`: 2차 보안 미설정 계정. **가입 이메일**로 보냅니다. 회원가입 때 입력한 휴대폰 번호로는 보내지 않습니다. 확인 후 "마이페이지에서 2차 보안을 설정할 수 있다"고 안내합니다.
   - `SMS`: 2차 보안 설정 계정. **등록 휴대폰**으로 보냅니다. [2차 보안](two-factor.md#정책)의 5회 연속 실패 30분 제한이 적용됩니다.
4. ②가 성공하면 토큰을 받고, 그 기기는 **마지막 사용 후 30일** 동안 추가 확인 없이 로그인합니다.

- `loginToken`은 일반 API에 쓸 수 없습니다.
- 비밀번호를 재설정하면 신뢰 기기가 모두 지워져 모든 기기에서 다시 확인합니다.
- `deviceId`를 보내지 않으면 기기 확인 없이 로그인합니다. **프론트 연동 전까지만** 두는 동작이며, 연동이 끝나면 필수로 바꿀 예정입니다.

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 401 `AUTH_INVALID_LOGIN_TOKEN` | `loginToken`이 만료(10분)되었거나 잘못됨 | 로그인 화면으로 |
| 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` | 확인 도중 잠기거나 정지됨 | 로그인과 같음 |
| 400 `BAD_REQUEST` | `loginToken` 없음, 인증번호 6자리 아님 | 입력칸 오류 |
| 400 `VERIFICATION_CODE_MISMATCH` + `details { remainingAttempts }` | 오입력 | 남은 횟수 표시 |
| 400 `VERIFICATION_EXPIRED` | 인증번호 5분 지남 | 만료 상태, [인증번호 다시 받기] |
| 404 `VERIFICATION_NOT_FOUND` | ①을 부르지 않고 ②, 또는 이미 로그인에 쓴 인증번호 | ①부터 |
| 400 `VERIFICATION_REQUIRED` | [인증 확인]을 연달아 눌러 같은 인증번호가 두 번 처리됨 | 버튼을 요청 중 비활성화. 먼저 보낸 요청의 응답을 씀 |
| 429 `VERIFICATION_RESEND_TOO_SOON` + `details { resendAvailableAt }` | 30초 안에 재발송 | `resendAvailableAt`까지 재발송 버튼 비활성화 |
| 429 `TWO_FACTOR_LOCKED` + `details { lockedUntil }` | SMS 5회 연속 실패, 또는 제한 중에 발송·확인 | 실패 횟수 초과 안내 후 로그인 화면 (계정은 잠기지 않음) |
| 429 `VERIFICATION_ATTEMPTS_EXCEEDED` | 이메일 인증번호 5회 초과 | 인증번호 다시 받기 |
| 503 `MAIL_SEND_FAILED` / `SMS_SEND_FAILED` | 발송 실패 | 잠시 후 다시 시도 |

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
| 메일 링크 열기 | `GET /api/auth/password-reset/open?token=` | 메일의 링크 그대로 | 앱 딥링크 `motu://new-password?token=...`로 이동하는 HTML |
| 링크 확인 (새 비밀번호 화면 진입 시) | `POST /api/auth/password-reset/verify` | `token` (딥링크의 `?token=` 값) | `valid: true` |
| 새 비밀번호 설정 | `POST /api/auth/password-reset/confirm` | `token`, `newPassword` | `null` |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 400 `AUTH_INVALID_PASSWORD_RESET_TOKEN` | 만료(30분), 이미 사용, 새 링크 발급으로 무효 | "링크가 만료되었거나 이미 사용되었습니다" 안내 후 재설정 요청 화면으로 |
| 400 `AUTH_SAME_AS_CURRENT_PASSWORD` | 현재 비밀번호와 같음 | 입력칸 아래에 문구 표시. **같은 링크로 바로 다시 시도할 수 있습니다.** |
| 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` | 링크를 받은 뒤 계정이 잠기거나 정지됨 | 잠금·정지 안내 |

- **링크 발송은 항상 성공 응답입니다.** 아이디·이메일이 맞지 않거나, 잠긴 계정이거나, 1분 안에 다시 요청했거나, 메일 발송에 실패해도 같은 응답입니다. 가입 여부를 드러내지 않기 위해서입니다. 화면은 항상 "이메일을 확인해 주세요" 안내를 보여 주면 됩니다.
- 새 링크를 보내면 이전 링크는 쓸 수 없습니다.
- **메일 링크와 앱 딥링크:** 메일에는 `PASSWORD_RESET_URL`(배포: `https://<백엔드 도메인>/api/auth/password-reset/open?token=...`)이 들어갑니다. 메일 앱은 `motu://` 같은 커스텀 스킴을 링크로 만들어 주지 않는 경우가 많아 https 주소를 거칩니다. 이 주소가 `PASSWORD_RESET_APP_URL`(기본 `motu://new-password`)에 같은 `token`을 붙여 앱으로 바로 넘기고, 브라우저가 자동 이동을 막으면 [앱에서 열기] 버튼을 보여 줍니다. 앱은 딥링크 `motu://new-password?token=...`을 받아 `verify` → `confirm` 순서로 호출하면 됩니다.
- 비밀번호를 바꾸면 모든 기기에서 로그아웃됩니다. 완료 후 로그인 화면으로 보내 주세요.
- 새 비밀번호 확인값 일치 여부는 프론트에서 확인합니다. (서버는 `newPassword` 하나만 받음)
- 관리자 계정은 이 API로 재설정 메일을 받을 수 없습니다. [관리자 비밀번호 재설정](#관리자-비밀번호-재설정)을 씁니다.

## 관리자 비밀번호 재설정

| 항목 | 내용 |
|------|------|
| 화면 | ADM-AUTH-02 (요청), ADM-AUTH-02-01 (새 비밀번호) |
| 로그인 | 불필요 |

| 단계 | API | 요청 | 응답 |
|------|------|------|------|
| 재설정 링크 발송 | `POST /api/auth/admin/password-reset` | `email` (관리자 등록 이메일) | `null` |
| 링크 확인 (새 비밀번호 화면 진입 시) | `POST /api/auth/admin/password-reset/verify` | `token` (메일 링크의 `?token=` 값) | `valid: true` |
| 새 비밀번호 설정 | `POST /api/auth/admin/password-reset/confirm` | `token`, `newPassword` (8~20자, 영문·숫자·특수문자 각 1개 이상) | `null` |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 404 `AUTH_ADMIN_EMAIL_NOT_REGISTERED` | 링크 발송: 등록되지 않은 이메일, 회원 이메일, 탈퇴한 관리자 | 입력칸 아래에 "등록된 관리자 이메일이 아닙니다." 표시 |
| 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` (링크 발송) | 잠기거나 정지된 관리자 | 잠금·정지 안내 (ADM-AUTH-01-E01) |
| 400 `AUTH_INVALID_PASSWORD_RESET_TOKEN` | 만료(10분), 이미 사용, 새 링크 발급으로 무효, 회원 재설정 링크 | "링크가 만료되었거나 이미 사용되었습니다" 안내 후 재설정 요청 화면으로 |
| 400 `AUTH_SAME_AS_CURRENT_PASSWORD` | 현재 비밀번호와 같음 | 입력칸 아래에 문구 표시. 같은 링크로 바로 다시 시도할 수 있습니다. |
| 403 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` | 링크를 받은 뒤 계정이 잠기거나 정지됨 | 잠금·정지 안내 |

- 링크 발송은 화면설계서대로 관리자 이메일이 아니면 404, 잠금·정지 관리자면 403으로 알려 줍니다. 회원 재설정과 달리 관리자 이메일 여부가 응답으로 드러납니다(관리자 페이지는 관리자에게만 공유).
- 1분 안에 다시 요청하거나 메일 발송에 실패해도 성공 응답입니다. 성공하면 "입력 정보가 확인되면 이메일로 링크를 보냅니다." 안내를 보여 주세요.
- 메일 링크는 `ADMIN_PASSWORD_RESET_URL`(관리자 웹 새 비밀번호 화면)에 `?token=...`을 붙인 주소입니다. 화면은 `token`으로 `verify` → `confirm` 순서로 호출합니다.
- 링크는 10분 동안 한 번만 쓸 수 있고, 새 링크를 보내면 이전 링크는 쓸 수 없습니다. 회원 재설정 링크와 서로 바꿔 쓸 수 없습니다.
- 새 비밀번호를 설정하면 기존 로그인 세션을 모두 만료하고, 임시 비밀번호 상태(`passwordChangeRequired`)도 풀립니다. 완료 후 관리자 로그인 화면으로 보내 주세요.
- 재설정으로 정지·탈퇴 상태는 풀리지 않습니다. 잠긴 관리자도 링크를 받을 수 없습니다. 다른 관리자가 [관리자 계정 상태 변경](admin-accounts.md#관리자-계정-상태-변경)으로 정상으로 되돌려야 합니다.

## 인증번호 공통 규칙

[가입 이메일 인증](users.md#가입-이메일-인증), [아이디 찾기](#아이디-찾기), [새 기기 확인](#새-기기-확인), [2차 보안](two-factor.md) SMS 인증번호는 같은 규칙입니다. SMS는 여기에 [5회 연속 실패 30분 제한](two-factor.md#정책)이 더해집니다.

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
| 429 `VERIFICATION_RESEND_TOO_SOON` + `details { resendAvailableAt }` | 30초 안에 재발송 | `resendAvailableAt`까지 재발송 버튼 비활성화 (화면을 다시 열었을 때도 이 값으로 복원) |
| 503 `MAIL_SEND_FAILED` | 메일 발송 실패 | 잠시 후 다시 시도 안내 (재발송 제한 없음) |

### 테스트용 인증번호 응답 (`devCode`)

배포 서버는 SMS를 실제로 보내지 않고(`SMS_SENDER` 없음) seed 테스트 계정은 `@motu.test` 주소라, 프론트 연동 중에는 인증번호를 받을 수 없습니다. 서버 환경 변수 `VERIFICATION_CODE_EXPOSURE`를 켜면 인증번호 **발송 응답**에 `devCode`가 함께 옵니다.

| 값 | 내용 |
|------|------|
| `off` (기본) | `devCode`를 내려주지 않음 |
| `sms` | SMS 인증번호만 (2차 보안 등록·재인증, 새 기기 확인(SMS), 연락처 변경) |
| `all` | SMS + 이메일 인증번호 (회원가입, 아이디 찾기, 새 기기 확인(이메일), 회원정보 수정) |

- 응답 예: `{ "expiresAt": "...", "resendAvailableAt": "...", "devCode": "123456" }`. 확인 API에는 이 값을 그대로 `code`로 보냅니다.
- 프론트는 `devCode`가 있을 때만 개발 편의용으로 쓰고(예: 개발 빌드에서 입력칸 자동 채움), 없으면 기존처럼 문자·메일로 받은 번호를 입력받습니다. 화면에 그대로 노출하지 않습니다.
- 켜 두면 2차 보안·이메일 인증이 의미가 없어지므로 실제 사용자가 있는 환경에서는 반드시 `off`로 둡니다. 켜져 있으면 서버 시작 로그에 경고가 남습니다.
