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
| 응답 | `userId`, `loginId`, `nickname`, `email`, `phoneNumber`(null 가능), `role`, `userStatus` |
