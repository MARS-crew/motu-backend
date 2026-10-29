# 2차 보안

[← API 명세서 목차](README.md)

등록한 휴대폰으로 SMS 인증을 받아 중요 기능을 보호합니다. 화면은 `[2차 개발]모투화면설계서.pptx` 기준입니다. 모두 로그인이 필요합니다.

- 회원가입 때 입력한 휴대폰 번호(`phoneNumber`)는 연락처일 뿐이라 2차 보안 번호로 쓰지 않습니다. 같은 번호라도 여기서 SMS 인증을 마쳐야 등록됩니다.
- 새 기기 로그인 확인은 [인증 > 새 기기 확인](auth.md#새-기기-확인)에 있습니다.

## 정책

| 항목 | 값 |
|------|------|
| 인증번호 | 6자리, 5분 유효, 재발송 30초 후 ([인증번호 공통 규칙](auth.md#인증번호-공통-규칙)과 같음) |
| 연속 실패 제한 | **5회 연속** 틀리면 30분 동안 SMS 인증만 제한 (`429 TWO_FACTOR_LOCKED`). 계정은 잠기지 않습니다. 인증번호를 바꿔 받아도 횟수는 이어집니다. 성공하면 0회로 돌아갑니다 |
| 재인증 유효시간 | SMS 인증 성공 후 **10분** 동안 중요 기능을 다시 묻지 않습니다 |
| 재인증이 필요한 기능 | 주문 기능 최초 활성화(2차 보안 설정 계정만), 등록 휴대폰 변경, 상장 신청 최종 제출(구현 예정) |
| 설정 상태 | `NOT_SET` 미설정 / `ENABLED` 설정 완료 / `DISABLED` 해제 |

## 2차 보안 상태

| 항목 | 내용 |
|------|------|
| 화면 | USR-MY-001(2차 보안 영역), USR-MY-004 |
| API | `GET /api/two-factor` |
| 응답 | `status`, `maskedPhoneNumber`(`010-****-4821`, 설정 완료일 때만), `enabledDate`(설정일시), `lastVerifiedDate`(최근 인증), `verifiedUntil`(재인증 유효 시각, 지났으면 null), `lockedUntil`(제한 중이면 시각), `remainingAttempts`(SMS 남은 입력 횟수) |

- 공통 2차 보안 화면에 들어가기 전에 이 API로 `lockedUntil`을 보면 제한 중인지 미리 알 수 있습니다.

## 2차 보안 설정 (휴대폰 인증)

| 항목 | 내용 |
|------|------|
| 화면 | USR-MY-004 [휴대폰 번호 인증] |
| API | ① `POST /api/two-factor/phone-verifications` ② `POST /api/two-factor/phone-verifications/confirm` |
| 요청 | ① `phoneNumber` (하이픈 유무 무관) ② `phoneNumber`, `code` |
| 응답 | ① `maskedPhoneNumber`, `expiresAt`, `resendAvailableAt`, `remainingAttempts` ② [2차 보안 상태](#2차-보안-상태)와 같음 |

- 인증하면 바로 `ENABLED`가 되고, 이 인증도 재인증으로 쳐서 10분 동안 유효합니다.
- 다른 번호로 인증번호를 새로 받으면 이전 번호로 받은 인증번호는 쓸 수 없습니다. ②의 `phoneNumber`는 ①에서 보낸 번호와 같아야 하며, 다르면 404 `VERIFICATION_NOT_FOUND`입니다.
- **등록 휴대폰 변경**: 이미 설정한 계정은 ①을 부르기 전에 기존 번호로 [재인증](#중요-기능-재인증)을 해야 합니다. 안 했으면 `403 TWO_FACTOR_REQUIRED` + `details.action = PHONE_CHANGE`입니다.
- 설정·변경 이력(`two_factor_histories`)에 번호, IP, User-Agent가 남습니다.

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 400 `BAD_REQUEST` | 휴대폰 번호 형식 오류 | 입력칸 오류 |
| 400 `VERIFICATION_CODE_MISMATCH` + `details { remainingAttempts }` | 오입력 | "남은 시도 횟수 n회" |
| 429 `TWO_FACTOR_LOCKED` + `details { lockedUntil }` | 5회 연속 실패, 또는 제한 중 | 실패 횟수 초과 상태(USR-AUTH-009-S02), 확인 시 이전 화면 |
| 403 `TWO_FACTOR_REQUIRED` + `details { action: PHONE_CHANGE }` | 설정 계정이 재인증 없이 번호 변경 | 공통 2차 보안 화면으로 이동 후 다시 요청 |
| 409 `TWO_FACTOR_SAME_PHONE_NUMBER` | 이미 등록된 번호 | |
| 400 `VERIFICATION_EXPIRED` / 404 `VERIFICATION_NOT_FOUND` | 5분 지남 / 발송 전 확인, 번호가 ①과 다름 | 인증번호 다시 받기 |
| 429 `VERIFICATION_RESEND_TOO_SOON` + `details { resendAvailableAt }` | 30초 안에 재발송 | `resendAvailableAt`까지 버튼 비활성화 |
| 503 `SMS_SEND_FAILED` | SMS 발송 실패 | 잠시 후 다시 시도 안내 |

## 2차 보안 해제

| 항목 | 내용 |
|------|------|
| 화면 | USR-MY-004-M01 |
| API | `POST /api/two-factor/disable` |
| 응답 | [2차 보안 상태](#2차-보안-상태) (`status: DISABLED`) |

- 해제 확인 모달에서 [해제]를 누르면 호출합니다. 해제 이력에 회원, 해제일시, IP, User-Agent를 남깁니다.
- 설정하지 않은 계정이면 `409 TWO_FACTOR_NOT_ENABLED`입니다.

## 중요 기능 재인증

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-009, 009-S01, 009-S02 (공통 SMS 2차 보안) |
| API | ① `POST /api/two-factor/verifications` ② `POST /api/two-factor/verifications/confirm` |
| 요청 | ① 없음 (등록 휴대폰으로 보냄) ② `code` |
| 응답 | ① `maskedPhoneNumber`, `expiresAt`, `resendAvailableAt`, `remainingAttempts` ② `verifiedUntil` |

**흐름**: 중요 기능 API가 `403 TWO_FACTOR_REQUIRED`(`details.action`)를 내려주면 → 공통 2차 보안 화면에서 ①② → 성공하면 **막혔던 요청을 그대로 다시 보냅니다.** (`action`으로 진입 사유 문구를 고릅니다)

| `details.action` | 진입 사유 |
|------|------|
| `ORDER_ACTIVATION` | 주문 기능 최초 활성화 |
| `PHONE_CHANGE` | 등록 휴대폰 번호 변경 |
| `LISTING_SUBMIT` | 상장 신청서 최종 제출 |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `TWO_FACTOR_NOT_ENABLED` | 미설정 계정 (SMS를 보내지 않음) | 2차 보안 설정 화면으로 이동 |
| 400 `VERIFICATION_CODE_MISMATCH` + `details { remainingAttempts }` | 오입력 | 실패 문구와 남은 횟수 (USR-AUTH-009-S01) |
| 429 `TWO_FACTOR_LOCKED` + `details { lockedUntil }` | 5회 연속 실패 | 실패 횟수 초과 (USR-AUTH-009-S02). 하던 작업은 완료하지 않음 |
| 400 `VERIFICATION_EXPIRED` / 404 `VERIFICATION_NOT_FOUND` | 5분 지남 / 발송 전 확인 | 인증번호 다시 받기 |
| 429 `VERIFICATION_RESEND_TOO_SOON` + `details { resendAvailableAt }` | 30초 안에 재발송 | `resendAvailableAt`까지 버튼 비활성화 |
| 400 `VERIFICATION_REQUIRED` | [인증 완료]를 연달아 눌러 같은 인증번호가 두 번 처리됨 | 요청 중 버튼 비활성화 |
| 503 `SMS_SEND_FAILED` | SMS 발송 실패 | 잠시 후 다시 시도 |

### 주문 기능 최초 활성화

- **2차 보안을 설정한 계정만** 첫 주문 전에 재인증합니다. 미설정 계정은 지금처럼 바로 주문합니다. (화면설계서는 미설정 계정도 설정을 요구하지만, 휴대폰이 없는 계정이 주문할 수 없게 되어 완화했습니다)
- 주문을 한 번 접수하면 다시 묻지 않습니다. 이 기능을 넣기 전에 주문한 적이 있는 계정도 활성화된 것으로 봅니다.
- [주문하기](orders.md#주문하기)가 `403 TWO_FACTOR_REQUIRED` + `action: ORDER_ACTIVATION`을 내려주면 재인증 후 같은 `clientOrderId`로 다시 보내면 됩니다.

### 다른 기능에서 쓰기 (백엔드)

`TwoFactorModule`을 import하고 `TwoFactorService.requireVerification(userId, TwoFactorAction.LISTING_SUBMIT)`을 호출합니다. 미설정이면 409 `TWO_FACTOR_NOT_ENABLED`, 10분 안에 재인증하지 않았으면 403 `TWO_FACTOR_REQUIRED`를 던집니다.

## 프론트 연동 체크리스트

| 상황 | 처리 |
|------|------|
| 에러 분기 | **HTTP 상태가 아니라 `error.code`로** 분기합니다. 403은 계정 잠김·정지(`AUTH_ACCOUNT_*`)와 재인증 필요(`TWO_FACTOR_REQUIRED`)가 섞여 있어, 403이라고 로그아웃하면 안 됩니다 |
| 401 | 새 기기 확인의 401 `AUTH_INVALID_LOGIN_TOKEN`은 로그인 전 단계라 토큰 재발급 대상이 아닙니다. 로그인 화면으로 보냅니다 |
| 기기 ID | 앱 설치(웹은 브라우저 저장소)마다 UUID 하나를 만들어 계속 씁니다. 로그아웃해도 지우지 않습니다. 지우면 새 기기로 봅니다 |
| 재인증 후 재시도 | `TWO_FACTOR_REQUIRED`로 막힌 요청은 재인증 성공 후 **같은 요청을 그대로** 다시 보냅니다. 주문은 같은 `clientOrderId`를 써도 됩니다 (막힌 주문은 접수되지 않았음) |
| 제한 중 | `TWO_FACTOR_LOCKED`의 `lockedUntil`까지 발송·확인 버튼을 막고, 하던 작업은 완료하지 않은 채 이전 화면으로 돌아갑니다. 제한 중에는 2차 보안 설정 계정의 새 기기 로그인, 첫 주문, 번호 변경을 할 수 없습니다 |
| 타이머 | `expiresAt`(유효시간), `resendAvailableAt`(재발송), `remainingAttempts`(시도 n/5)는 모두 응답 값으로 그립니다. 재발송 429에도 `resendAvailableAt`이 옵니다 |
| 중복 클릭 | 발송·확인 버튼은 요청 중 비활성화합니다 |

## SMS 발송

- Brevo HTTPS API(`/v3/transactionalSMS/send`)로 보냅니다. `BREVO_API_KEY`와 `SMS_SENDER`(Brevo에 등록한 발신자 이름, 영문·숫자 11자 이하)가 모두 있어야 실제로 나갑니다.
- 설정이 없으면 SMS를 보내지 않고 **서버 로그에 인증번호를 출력**합니다. SMS는 유료라 실제 발송 여부를 정하기 전까지는 **개발 서버(Railway)도 이 방식**입니다. 인증번호는 Railway Server 서비스의 로그에서 `[SMS] to=휴대폰번호` 다음 줄로 확인합니다.
- 국내 통신사는 해외 발송 SMS에 `[국제발신]`을 붙이고 발신 번호를 임의 번호로 바꿉니다.
- 로컬 테스트 계정: `motusecure` (2차 보안 설정 완료, 휴대폰 `01000000000`)
