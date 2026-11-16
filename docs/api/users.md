# 회원가입·회원

[← API 명세서 목차](README.md)

## 아이디·닉네임 중복 확인

| 항목 | 내용 |
|------|------|
| 화면 | USR-AUTH-003, 003-M01 |
| API | `GET /api/users/login-id/availability?loginId=` / `GET /api/users/nickname/availability?nickname=` |
| 로그인 | 불필요 |
| 응답 | `available` (true면 사용 가능) |
| 에러 | 400 형식 오류 (아이디 5~20자 영문 소문자·숫자, 닉네임 2~10자 한글·영문·숫자) |

## 회원가입 순서

1. 약관 동의 (USR-AUTH-002) — 프론트에서만 처리
2. 기본 정보 입력, [아이디·닉네임 중복 확인](#아이디닉네임-중복-확인)
3. [가입 이메일 인증](#가입-이메일-인증)
4. [회원가입](#회원가입)

## 가입 이메일 인증

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
| [인증번호 공통 에러](auth.md#인증번호-공통-규칙) | |

- 발송 성공 화면의 "사용 가능한 이메일입니다."는 발송 API가 성공했다는 뜻으로 표시하면 됩니다.

## 회원가입

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

## 내 정보

| 항목 | 내용 |
|------|------|
| API | `GET /api/users/me` |
| 로그인 | 필요 |
| 화면 | USR-MY-01 마이페이지 (`[2차 개발]모투화면설계서.pptx`) |
| 응답 | `userId`, `loginId`, `nickname`, `email`, `phoneNumber`(연락처, null 가능), `role`, `userStatus`, `twoFactorStatus` |

- 마이페이지 회원 기본 정보 영역에 닉네임·이메일·연락처(가운데 가림은 프론트)를 표시합니다.
- `twoFactorStatus`로 2차 보안 영역을 그립니다. `ENABLED`면 "2차 보안 설정 완료"와 [2차 보안 관리], `NOT_SET`·`DISABLED`면 [2차 보안 설정하기]입니다. 등록 번호·설정일시는 [2차 보안 상태](two-factor.md)에서 가져옵니다.

## 연락처 변경

| 항목 | 내용 |
|------|------|
| 화면 | USR-MY-03-01 연락처 변경 (`[2차 개발]모투화면설계서.pptx`) |
| 로그인 | 필요 |
| 발송 | `POST /api/users/me/phone-verifications` `{ phoneNumber }` → `maskedPhoneNumber`, `expiresAt`(5분), `resendAvailableAt`(30초) |
| 확인·변경 | `POST /api/users/me/phone-verifications/confirm` `{ phoneNumber, code }` → 바뀐 [내 정보](#내-정보) |

- **2차 보안을 설정한 회원만** 바꿀 수 있습니다. 화면 진입 전에 `twoFactorStatus`가 `ENABLED`가 아니면 "2차 보안 설정 후 이용해 주세요." 토스트를 띄우고 2차 보안 설정 화면으로 보냅니다. (API도 403으로 막습니다.)
- 새 번호로 SMS 인증번호를 보냅니다. 휴대폰 번호는 하이픈이 있어도 됩니다. 인증번호 규칙(5분 유효, 30초 후 재발송, 5회 오입력 시 새 인증번호 필요)은 [인증번호 공통 규칙](auth.md)과 같습니다.
- 다른 번호로 다시 보내면 이전 번호로 받은 인증번호는 쓸 수 없습니다. 확인할 때는 인증번호를 받은 번호를 그대로 보냅니다.
- 연락처는 **2차 보안 번호와 별개**입니다. 연락처를 바꿔도 2차 보안 번호는 그대로이고, 2차 보안 번호는 [2차 보안](two-factor.md)에서 바꿉니다.

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 403 `USER_CONTACT_TWO_FACTOR_REQUIRED` | 2차 보안 미설정·해제 | "2차 보안 설정 후 이용해 주세요." 후 2차 보안 설정으로 이동 |
| 409 `USER_SAME_PHONE_NUMBER` | 현재 연락처와 같은 번호 | 입력칸 아래 안내 |
| 400 `BAD_REQUEST` | 휴대폰 번호·인증번호 형식 오류 | 입력칸 아래 안내 |
| 429 `VERIFICATION_RESEND_TOO_SOON` | 30초 안에 다시 발송 | `details.resendAvailableAt`까지 버튼 비활성화 |
| 400 `VERIFICATION_CODE_MISMATCH` | 인증번호 불일치 | "인증번호가 일치하지 않습니다. 다시 확인해 주세요." (`details.remainingAttempts`) |
| 400 `VERIFICATION_EXPIRED` | 인증번호 만료 | 인증번호를 다시 받게 안내 |
| 404 `VERIFICATION_NOT_FOUND` | 발송 전이거나 다른 번호로 확인 | 인증번호를 다시 받게 안내 |
| 429 `VERIFICATION_ATTEMPTS_EXCEEDED` | 5회 오입력 | 인증번호를 다시 받게 안내 |
| 503 `SMS_SEND_FAILED` | SMS 발송 실패 | "인증번호 발송에 실패했습니다. 다시 시도해 주세요." |
