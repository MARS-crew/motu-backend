# 관리자 계정

[← API 명세서 목차](README.md)

관리자 계정 생성, 상태 변경(정상·정지), 관리자 비밀번호 변경입니다. 모두 **관리자** 토큰이 필요합니다.

- 화면: `[2차 개발]모투화면설계서.pptx`의 ADM-ACC-02 관리자 계정 생성·상태 변경, ADM-ACC-02-E01 본인 계정 정지 차단, ADM-ACC-02-E02 마지막 정상 관리자 정지 차단
- 모든 관리자 계정은 같은 ADMIN 권한을 갖는다. 운영자·최고 관리자 구분이나 역할 선택은 없다.
- 관리자 계정 목록(ADM-ACC-01)은 이 작업 범위가 아니다.

## 저장 위치

- 로그인 정보는 `users`(role=`ADMIN`)에, 관리자에게만 있는 값은 `admin_profiles`에 둔다.

| `admin_profiles` 컬럼 | 값 |
|---|---|
| `user_id` (PK) | 관리자 user_id |
| `name` | 관리자명. 동명이인 허용, 1~20자 |
| `duty` | 담당 업무(참고값). 선택, 50자 이내. 권한과 관계없다 |
| `password_change_required` | 임시 비밀번호 상태. 생성 시 true, 비밀번호를 바꾸면 false |

- 관리자에게 의미 없는 회원 정보는 비워 둔다. 닉네임·생년월일은 null, 약관 동의는 모두 false다.
- seed로 만든 관리자처럼 `admin_profiles` 행이 없는 관리자는 임시 비밀번호 상태가 아닌 것으로 본다.

## 관리자 계정 생성

`POST /admin/admin-accounts` — `{ loginId, name, email, duty? }`

- 아이디는 회원가입과 같은 규칙(5~20자 영문 소문자·숫자), 이메일은 소문자로 저장한다.
- 임시 비밀번호(12자, 영문 대소문자·숫자·특수문자)를 만들어 등록 이메일로 보낸다. 메일을 보내지 못하면 계정도 만들지 않는다(`503 / MAIL_SEND_FAILED`).
- 관리자 활동 이력 `ADMIN_CREATE`에 아이디·관리자명·이메일·담당 업무를 남긴다. 임시 비밀번호는 남기지 않는다.

| 에러 | 상황 |
|---|---|
| 409 `LOGIN_ID_DUPLICATED` | 이미 쓰는 아이디 (회원·관리자 공통) |
| 409 `EMAIL_DUPLICATED` | 이미 쓰는 이메일 (회원·관리자 공통) |
| 503 `MAIL_SEND_FAILED` | 메일 발송 실패. 계정은 만들어지지 않으니 다시 시도한다 |

## 임시 비밀번호 상태

- 생성한 관리자는 메일로 받은 임시 비밀번호로 로그인한다. 로그인 API는 그대로다.
- 비밀번호를 바꾸기 전에는 비밀번호 변경 외의 관리자 API(`@Roles(ADMIN)`)가 모두 `403 / ADMIN_PASSWORD_CHANGE_REQUIRED`다. 로그인 응답의 `passwordChangeRequired`가 true면 화면은 로그인 직후 비밀번호 변경 화면으로 보낸다. 403은 이 분기를 건너뛰고 다른 API를 호출하는 경우를 막는 용도다.

## 관리자 비밀번호 변경

`PATCH /admin/admin-accounts/me/password` — `{ currentPassword, newPassword }`

- 로그인한 관리자 본인의 비밀번호를 바꾼다. 임시 비밀번호 상태에서도 호출할 수 있고, 성공하면 임시 비밀번호 상태가 풀린다. 응답 `data`는 null이다.
- 새 비밀번호는 회원 비밀번호 규칙(8~20자, 영문·숫자·특수문자 각 1개 이상)을 따른다.

| 에러 | 상황 |
|---|---|
| 400 `ADMIN_INVALID_CURRENT_PASSWORD` | 현재 비밀번호가 틀림 |
| 400 `ADMIN_SAME_PASSWORD` | 새 비밀번호가 현재 비밀번호와 같음 |

## 관리자 계정 상태 변경

`PATCH /admin/admin-accounts/:userId/status` — `{ status: ACTIVE | BLOCKED, reason }`

- 사유는 필수(1~200자)이고 관리자 활동 이력 `ADMIN_STATUS_CHANGE`의 사유에 남는다. 요약은 `정상 → 정지`처럼 남는다. 실패한 변경은 남기지 않는다.
- 정지하면 그 관리자의 로그인 세션(Refresh 토큰)을 모두 만료한다. 정지 계정은 로그인할 수 없고, 이미 받은 Access 토큰도 다음 요청부터 `ACCOUNT_BLOCKED`다.
- 정상으로 되돌리면 로그인 실패 횟수를 0으로 초기화한다.
- 관리자 둘이 동시에 서로를 정지해도 정상 관리자가 0명이 되지 않도록 관리자 행을 잠그고 처리한다.

| 에러 | 상황 | 화면 |
|---|---|---|
| 409 `ADMIN_ACCOUNT_SELF_BLOCK` | 본인 계정 정지 | ADM-ACC-02-E01 "본인 계정은 정지할 수 없습니다." |
| 409 `ADMIN_ACCOUNT_LAST_ACTIVE` | 정지하면 정상 관리자가 0명 | ADM-ACC-02-E02 "정상 관리자 계정은 최소 1개 이상 남아야 합니다." |
| 400 `ADMIN_ACCOUNT_STATUS_UNCHANGED` | 이미 그 상태 | |
| 404 `ADMIN_ACCOUNT_NOT_FOUND` | 관리자 계정이 아님 (일반 회원은 회원 상태 변경 API) | |

- 본인 정지이면서 마지막 정상 관리자인 경우 본인 정지 오류가 먼저다.
- 오류가 나면 화면은 상태·사유 입력값을 유지한다.
