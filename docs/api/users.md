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

## 닉네임 변경

| 항목 | 내용 |
|------|------|
| API | `PATCH /api/users/me/nickname` |
| 로그인 | 필요 |
| 요청 | `{ "nickname": "모투고수" }` |
| 응답 | `200` 및 변경된 [내 정보](#내-정보) |

| 에러 | 상황 |
|------|------|
| 400 `BAD_REQUEST` | 닉네임이 한글·영문·숫자 2~10자 규칙을 충족하지 않음 |
| 409 `NICKNAME_DUPLICATED` | 다른 회원이 사용 중인 닉네임 |
| 404 `USER_NOT_FOUND` | 회원 정보가 존재하지 않음 |

- 현재 닉네임을 그대로 보내면 `200`을 반환합니다.
- 저장 성공 후 응답의 `data.nickname`으로 화면을 갱신합니다.

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

---

## 회원 탈퇴

| 항목 | 내용 |
|------|------|
| API | `POST /api/users/me/withdrawal` |
| 로그인 | 필요. 정상 상태의 일반 회원 본인 |
| 요청 본문 | `reason` 필수. 앞뒤 공백 제거 후 1~50자 |
| 성공 | `204 No Content` |

```json
{ "reason": "서비스 이용 빈도가 낮아졌습니다." }
```

- 계좌를 잠근 뒤 본인의 승인된 상장 신청에 연결된 미삭제 거래 대기 상품(`PENDING`)이 있는지 확인합니다. 대상이 있으면 주문, 포인트, 계정, 세션을 변경하기 전에 `409`를 반환합니다.
- 접수·부분 체결 주문의 미체결분을 취소하고 포인트·수량 예약을 해제합니다. 보유 포인트를 0으로 만들고 차감액을 `WITHDRAWAL` 이력에 기록합니다. 기존 보유 수량과 거래 이력은 기존 계좌에 남습니다.
- 탈퇴 상태·일시·사유를 기록하고 이메일·연락처·생년월일·닉네임을 비웁니다. 이전 로그인 아이디는 재사용할 수 있습니다. 관리자 조회에서 닉네임은 `탈퇴한 회원`, 삭제한 이메일은 `null`로 표시합니다.
- 2차 보안 번호와 이력에 남은 전화번호를 비우고, 신뢰 기기를 삭제합니다. 활성 가격 알림은 끄고 Refresh 토큰과 비밀번호 재설정 토큰을 무효화합니다.
- 탈퇴 처리는 하나의 트랜잭션으로 반영합니다. 동일한 아이디·이메일이나 닉네임으로 가입하면 새 회원과 계좌가 생성됩니다. 응답이 성공이면 프론트에서 토큰을 지우고 로그인 화면으로 이동합니다.

| 에러 | 상황 |
|------|------|
| 400 `BAD_REQUEST` | 사유 누락, 공백, 허용 길이 초과 또는 요청 형식 오류 |
| 401 `AUTH_UNAUTHORIZED` / `AUTH_TOKEN_EXPIRED` | 토큰이 없거나 만료됐거나 탈퇴한 계정 |
| 403 `AUTH_FORBIDDEN` / `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED` | 일반 회원이 아니거나 잠김·정지 상태 |
| 404 `ACCOUNT_NOT_FOUND` | 계좌가 존재하지 않음 |
| 409 `USER_WITHDRAWAL_PENDING_LISTING` | 승인된 상품이 거래 시작을 기다리고 있어 탈퇴할 수 없습니다. 고객센터에 문의해 주세요. |
| 409 `USER_STATUS_CONFLICT` / `ACCOUNT_CONCURRENT_UPDATE` | 처리 중 회원·계좌·주문 상태가 바뀜 |
| 409 `ACCOUNT_WITHDRAWAL_LOCKED_CASH` | 주문 취소 후에도 예약 포인트가 남음 |

---

## 관리자 회원 관리

모두 **관리자** 토큰이 필요합니다. 화면은 `[2차 개발]모투화면설계서.pptx`의 ADM-MBR-01·02입니다. 일반 회원(`role: USER`)만 다루고, 관리자 계정은 나오지 않습니다(상세·처리는 404).

회원 상태: `ACTIVE` 정상, `LOCKED` 잠금(로그인 5회 실패 또는 관리자 처리), `BLOCKED` 정지, `WITHDRAWN` 탈퇴

### 회원 목록 (ADM-MBR-01)

`GET /api/admin/users`

| 쿼리 | 설명 |
|------|------|
| `loginId` | 아이디 일부 |
| `nickname` | 닉네임 일부 |
| `status` | 회원 상태 |
| `page`, `size` | 페이지(1부터), 한 페이지 건수(기본 10, 최대 50) |

응답 `items[]`: `userId`, `loginId`, `nickname`, `email`(가림, 탈퇴 회원은 null), `createDate`(가입일시), `userStatus`, `lastLoginDate`(최근 접속, 없으면 null). 가입일 최신순이며 `page`, `size`, `totalCount`를 같이 내려줍니다.

### 회원 상세 (ADM-MBR-02)

`GET /api/admin/users/:userId`

목록 항목에 더해 아래 값을 내려줍니다.

| 영역 | 필드 |
|------|------|
| 인증·계정 `security` | `emailVerified`(가입 시 인증하므로 항상 true), `twoFactorStatus`, `twoFactorPhoneNumber`(가림, 없으면 null), `twoFactorVerifiedDate`(최근 2차 인증), `loginFailCount`(연속 로그인 실패 횟수) |
| 자산·활동 `asset` | `availableCash`(사용 가능 포인트), `lockedCash`(예약 포인트), `holdingCount`(보유 상품 수), `openOrderCount`(미체결 주문 수) |

- 최근 접속일시는 목록 항목의 `lastLoginDate`입니다.
- 최근 처리 이력은 [관리자 활동 이력](admin-activity-logs.md) `GET /api/admin/activity-logs?targetType=USER&targetId={userId}&size=1`로 가져옵니다.
- 포인트 지급·회수는 [관리자 계좌 관리](accounts.md#관리자-계좌-관리)의 `PATCH /api/admin/accounts/:userId/cash`를 씁니다. 회수 가능 금액은 `availableCash`까지입니다.
- 잠금 사유는 `loginFailCount`가 5회 이상이면 "로그인 5회 누적 실패"로 표시합니다. 관리자가 잠근 경우는 활동 이력의 사유를 봅니다.

### 회원 상태 변경 (ADM-MBR-02-01)

`PATCH /api/admin/users/:userId/status`

| 요청 | 설명 |
|------|------|
| `status` | 변경할 상태 (`ACTIVE` / `LOCKED` / `BLOCKED`) |
| `reason` | 변경 사유, 1~200자, 필수 |
| `anomalyId` | 선택. 이상 거래 상세(ADM-MON-02)에서 회원 정지로 넘어온 경우 이상 거래 ID. `status`가 `BLOCKED`일 때만 |

응답: `userId`, `statusBefore`, `statusAfter`

- 잠금·정지로 바꾸면 그 회원의 로그인 세션(Refresh 토큰)을 모두 만료합니다. 이미 받은 Access 토큰도 다음 요청부터 `AUTH_ACCOUNT_LOCKED` / `AUTH_ACCOUNT_BLOCKED`로 막힙니다.
- 잠금에서 정상으로 바꾸면 로그인 실패 횟수도 0으로 초기화합니다.
- 변경 전·후 상태와 사유는 관리자 활동 이력(`USER_STATUS_CHANGE`)에 남습니다.
- 이상 거래 상세(ADM-MON-02)에서 진입한 경우 `anomalyId`를 함께 보내면 정지와 같은 트랜잭션에서 그 이상 거래를 처리완료합니다. 이상 거래의 회원이 아니면 400 `ANOMALY_TARGET_MISMATCH`, 정지가 아니면 400 `ANOMALY_INVALID_ACTION`, 이미 처리완료면 409 `ANOMALY_ALREADY_RESOLVED`입니다. ([거래 모니터링](anomalies.md#조치-adm-mon-02-46번)) 처리 후 그 화면으로 돌아가는 것은 프론트에서 처리합니다.

### 계정 잠금 해제 (ADM-MBR-02-02)

`POST /api/admin/users/:userId/unlock`

| 요청 | 설명 |
|------|------|
| `reason` | 해제 사유, 1~200자, 필수 |

응답: `userId`, `statusBefore`(`LOCKED`), `statusAfter`(`ACTIVE`)

- 잠금 계정만 해제할 수 있습니다. 정상으로 바꾸고 로그인 실패 횟수를 0으로 초기화합니다.
- 변경 전·후 상태·실패 횟수와 사유는 관리자 활동 이력(`USER_UNLOCK`)에 남습니다.

### 에러

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 400 `USER_STATUS_UNCHANGED` | 현재 상태와 같은 상태로 변경 | "변경하려는 상태와 현재 상태가 같습니다." |
| 400 `BAD_REQUEST` | 사유 누락·200자 초과, 상태 값 오류 | 사유 누락이면 "사유 입력은 필수입니다." |
| 404 `USER_NOT_FOUND` | 없는 회원, 관리자 계정 | |
| 409 `USER_NOT_LOCKED` | 잠금 상태가 아닌 계정의 잠금 해제 | 상세를 다시 불러옵니다. |
| 409 `USER_STATUS_CONFLICT` | 처리하는 사이 상태가 바뀜 (로그인 실패로 잠김, 다른 관리자 처리) | 상세를 다시 불러온 뒤 다시 처리합니다. |
| 403 `AUTH_FORBIDDEN` | 관리자가 아님 | |
