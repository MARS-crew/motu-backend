# 제한 계정 1:1 문의

[← API 명세서 목차](README.md)

## 범위와 기준

- MOTU-44-01-01(잠금·정지 계정 문의 접수/문의번호 발급), MOTU-44-01-02(본인 문의 내역 조회). 이슈 #58.
- 최신 dev·README의 인증/DTO/응답 규칙과 ERD의 Inquiry(작성자, 문의번호, 유형, 제목, 내용, 상태, 생성/수정일)를 따른다. 물리 테이블명은 기존 코드와 같이 `inquiries`를 사용한다.
- [1차 화면설계서](https://docs.google.com/presentation/d/1432WUouwlx6Jp-_mh67lpIPurlO5ja5X/edit)의 USR-LST-01-M02, USR-LST-01-02에는 잠금·정지 제한 안내에서 문의 화면으로 이동하는 흐름이 있다. 제공된 [1차 IA](https://docs.google.com/spreadsheets/d/18IZuGCG0WY9OYwqpgGDTa3rN43op8eiumYNFRp6DHdY/edit)와 [1차 SRS](https://docs.google.com/spreadsheets/d/1Yyk_KWuRlCEWIedvOdFgjUvsCJL54SwqT4zrGmPuCMA/edit)에는 문의 폼·본인 확인 수단·문의번호 형식의 상세 기준은 없다.
- 따라서 다음 세부 규칙은 이번 API의 구현 기준이다. 문의 전용 본인 확인은 기존 아이디·비밀번호로 진행하고, 제목 1~100자/본문 1~5000자, 페이지 기본 10건, 문의번호는 아래 형식을 사용한다. 기획의 확정 문구로 간주하지 않으며 화면 연결 시 공유한다.
- 관리자 접수 처리·답변·계정 해제·상태 변경 API, 일반 사용자 자유 문의, 첨부파일 및 외부 메일/SMS/푸시 발송은 포함하지 않는다. 비밀번호를 모르는 회원의 별도 본인 확인/문의 경로도 이번에 추가하지 않는다.

## API

모든 경로는 `/api` 기준이다. 일반 로그인은 잠금·정지 계정을 계속 차단한다. 문의에 한해 별도 본인 확인을 제공하며, 임의의 회원 ID나 이메일만으로 접수/조회할 수 없다.

| 메서드 | 경로 | 인증 | 용도 |
|---|---|---|---|
| POST | `/inquiries/access-token` | 아이디·비밀번호 | 잠금·정지 계정 문의 전용 토큰 발급 |
| POST | `/inquiries` | 문의 전용 토큰 | 제한 해제 문의 접수 및 문의번호 발급 |
| GET | `/inquiries?page=1&size=10` | 문의 전용 토큰 또는 정상 계정 Access 토큰 | 본인 문의 목록 |
| GET | `/inquiries/:inquiryId` | 동일 | 본인 문의 상세 |

### 문의 본인 확인

```json
{ "loginId": "motulocked", "password": "motuuser1!" }
```

성공 시 `data: { "inquiryAccessToken": "...", "expiresIn": 900 }`를 반환한다. 토큰은 15분간 유효하고 Refresh 토큰은 발급하지 않는다. 일반 로그인 실패 횟수·최근 로그인 시각·계정 잠금/정지 상태를 바꾸지 않는다. 문의용 실패 횟수와 차단 시각은 별도 DB 테이블 `inquiry_access_attempts`에 저장한다. 만료되면 아이디·비밀번호로 다시 확인한다.

- `LOCKED`, `BLOCKED` 계정만 비밀번호 검사를 수행한다. 정상 계정과 없는 계정은 비밀번호 확인 전에 동일한 `401 / INQUIRY_INVALID_CREDENTIALS`로 거절한다. 정상 계정에서는 비밀번호가 맞는지 알아내는 경로로 사용할 수 없다.
- 기존 JWT 키에서 용도를 분리해 만든 키로 HS256 서명하며, `purpose=INQUIRY`, 발급자/수신자를 검증한다. 일반 API와 `/auth/refresh`에 사용할 수 없다. 기존 키 외에 새 환경 변수는 필요 없다.
- 토큰은 프론트의 **일반 로그인 Access 토큰과 별도로** 보관한다. 문의 화면을 나가면 전용 토큰을 제거한다. URL/로그에 토큰과 비밀번호를 남기지 않는다.
- 문의용 비밀번호를 연속 5회 틀리면 5번째 요청부터 `429 / INQUIRY_ACCESS_TEMPORARILY_BLOCKED`를 반환하고 15분간 차단한다. 차단 중에는 올바른 비밀번호도 검사/발급하지 않으며 만료 시각을 연장하지 않는다. 만료 후 실패는 1회부터 다시 집계하고, 성공하면 문의용 실패 기록만 초기화한다. 이 제한은 회원 행 잠금과 DB 기록으로 여러 인스턴스·서버 재시작에도 유지된다. 일반 로그인 실패 횟수나 기존 LOCKED/BLOCKED 상태를 초기화하지 않는다.
- 별도로 계정당 1분 최대 10회(성공·실패 포함) 본인 확인 요청을 허용한다. 현재 Railway 1개 인스턴스를 기준으로 한 프로세스 내 제한이며 재시작하면 초기화된다. 여러 인스턴스 운용 시 공유 저장소/게이트웨이 기반 제한이 필요하다.
- 일반 Access 토큰을 받았던 계정이 나중에 잠금/정지된 경우에도 기존 토큰으로 문의를 우회하지 않고 전용 본인 확인부터 진행한다.

### 접수

```json
{ "title": "계정 잠금 해제 문의", "content": "계정이 잠겼습니다. 잠금 해제 절차를 알려주세요." }
```

- 제목·본문 앞뒤 공백을 제거한 뒤 제목 1~100자, 본문 1~5000자를 DTO와 서비스 양쪽에서 검증한다. 길이 기준 상수를 공유하며 Swagger 스키마에도 minLength/maxLength를 명시한다. DB는 제목 VARCHAR(100), 본문 VARCHAR(5000) 및 빈 문자열 거절 제약으로 직접 저장 시에도 제한한다. 이모지 한 글자는 1자로 센다. 공백만 있거나 타입이 다르면 거절한다. 본문 내부 줄바꿈은 보존하며 일반 텍스트로 취급한다.
- 작성자는 토큰의 본인으로 고정한다. `userId`, `inquiryCode`, `inquiryType`, `status` 등 추가 필드는 거절한다.
- 접수 시 DB의 최신 계정 상태를 확인해 LOCKED는 `LOGIN_FAILED_LOCKED`, BLOCKED는 `SUSPENDED`로 자동 분류한다. 문의 접수와 동시에 계정 제한이 해제되는 경우 회원 행 잠금으로 선후관계를 보장한다.
- 문의번호는 `INQ-YYYYMMDD-XXXXXXXXXXXX`(한국 날짜 + 무작위 12자리 16진수)다. 일일 순번이 아니다. DB UNIQUE 제약으로 중복을 막고 충돌 시 새 트랜잭션에서 최대 3회 시도한다.
- 접수 상태는 `SUBMITTED`다. 향후 처리를 위한 ERD 상태 `IN_PROGRESS`, `APPROVED`도 스키마에 정의하지만 이번에 변경 API는 노출하지 않는다.
- 같은 내용으로 POST를 다시 보내면 별도의 문의가 접수된다. 프론트는 제출 중 중복 클릭을 막고, 통신 오류 후에는 본인 목록에서 접수 여부를 먼저 확인한다.

HTTP 201의 `data` 예시:

```json
{
  "id": 1,
  "inquiryCode": "INQ-20261028-A1B2C3D4E5F6",
  "inquiryType": "LOGIN_FAILED_LOCKED",
  "title": "계정 잠금 해제 문의",
  "content": "계정이 잠겼습니다. 잠금 해제 절차를 알려주세요.",
  "status": "SUBMITTED",
  "createDate": "2026-10-28T09:00:00.000Z",
  "modifiedDate": "2026-10-28T09:00:00.000Z"
}
```

### 본인 문의 목록·상세

목록 응답은 `data: { items: [문의 객체], page: 1, size: 10, totalCount: 1 }`다. 최신 생성일 내림차순, 생성일이 같으면 ID 내림차순이다. `page` 1~100000, `size` 1~50을 허용한다. 빈 목록은 `items: []`, `totalCount: 0`이다. 조회만으로 상태가 변경되지는 않는다.

상세는 목록의 `id`로 조회하며 접수 당시 제목·본문·문의번호·현재 상태·생성/수정일을 반환한다. 타인 문의와 없는 문의는 같은 404로 응답하고, 목록의 개수와 항목도 본인 데이터만 포함한다. 비밀번호·이메일·다른 회원 정보는 반환하지 않는다.

계정 제한이 해제된 후에는 기존 문의 전용 토큰의 남은 유효기간 동안 이력을 조회할 수 있으나 새 제한 문의는 접수할 수 없다. 이후 정상 로그인 Access 토큰으로 기존 이력을 계속 조회한다.

| 상태/코드 | 상황 |
|---|---|
| 401 `INQUIRY_INVALID_CREDENTIALS` | 없는 아이디, 정상 계정(비밀번호 정오 무관), 제한 계정의 틀린 비밀번호(1~4회) |
| 401 `INQUIRY_UNAUTHORIZED` | 문의 인증 없음, 위조·잘못된 목적/수신자, 없는 회원, 제한 계정의 기존 일반 토큰 |
| 401 `INQUIRY_TOKEN_EXPIRED` | 문의/일반 토큰 만료 |
| 403 `INQUIRY_ACCOUNT_NOT_RESTRICTED` | 정상 계정의 새 제한 문의 접수 (전용 토큰 발급은 동일한 401) |
| 404 `INQUIRY_NOT_FOUND` | 타인/없는 문의 또는 ID 범위 초과 |
| 429 `INQUIRY_ACCESS_TEMPORARILY_BLOCKED` | 문의 비밀번호 연속 5회 실패 및 15분 차단 중 |
| 429 `INQUIRY_TOO_MANY_ATTEMPTS` | 문의 본인 확인 요청 제한 초과 |
| 400 `BAD_REQUEST` | 한글 안내 문구와 함께 입력값·페이지·경로 ID 검증 실패 |

## 로컬 Swagger 테스트

1. 로컬 PostgreSQL에 마이그레이션을 적용하고 `npm run db:seed`, `npm run start:dev` 실행. 공개된 seed 비밀번호는 로컬 전용이다.
2. `http://localhost:3000/api/docs`의 Inquiries에서 `POST /api/inquiries/access-token`에 `motulocked`/`motuuser1!`을 입력한다. 정지 계정은 `motublocked`를 사용한다. 일반 로그인 `/auth/login`은 403이 정상이다.
3. 반환된 `inquiryAccessToken`을 Swagger Authorize에 넣는다. 이미 정상 계정 토큰이 있으면 교체한다.
4. `POST /api/inquiries`에 위 접수 본문을 전송하고 201·문의번호·SUBMITTED를 확인한다.
5. `GET /api/inquiries`에서 본인 문의와 `totalCount`를 확인한다. 반환된 `id`로 `GET /api/inquiries/{inquiryId}`를 조회한다.
6. `motublocked`의 전용 토큰으로 교체해 앞서 만든 잠금 계정 문의 ID를 상세 조회하면 404다. 새 문의를 접수하면 유형은 SUSPENDED다.
7. 문의 토큰으로 `GET /api/users/me`를 호출하면 401이다. 일반 기능 테스트로 돌아갈 때는 `motuuser`로 정상 로그인해 Authorize를 다시 교체한다.

8. 정상 계정 `motuuser`로 `POST /api/inquiries/access-token`을 호출하면 비밀번호가 맞아도 틀려도 동일한 401이다.
9. 별도 로컬 제한 계정으로 문의 비밀번호를 5회 틀리면 1~4회는 401, 5회부터 429 `INQUIRY_ACCESS_TEMPORARILY_BLOCKED`다. 이후 올바른 비밀번호로도 15분간 발급할 수 없다. 1분 10회 요청 제한과 별개이며, 반복 확인을 피하고 15분 후 다시 시도한다. 만료·동시 요청·재시작 검증은 아래 자동 스크립트에서 별도 테스트 계정으로 수행한다.

## 자동 검증·배포

```powershell
npm run lint
npm test
npm run build
node scripts/verify-inquiries.mjs
```

HTTP 검증은 localhost PostgreSQL에 별도 임시 DB를 만들고 모든 마이그레이션을 적용한 뒤 테스트한다. 운영 DB/메일/MinIO는 사용하지 않으며 테스트 DB는 종료 시 삭제한다. 인증·한글 검증·본인/타인 조회·페이지·동시 접수·제한 해제 후 일반 API 격리·요청 제한, 정상 계정의 비밀번호 확인 우회 차단, 5회 실패/15분 차단/만료/성공 초기화, 두 앱의 동시 실패, 별도 자식 프로세스의 차단 유지, 서비스 직접 호출 및 DB 길이 제한을 검증한다.

새 `add_inquiries` 및 리뷰 보강용 `harden_inquiry_access` 마이그레이션을 함께 적용한다. 후자는 실패 기록 테이블을 만들고 기존 본문을 VARCHAR(5000)으로 제한한다. 기존 값이 5000자를 넘거나 빈 문자열이면 자동으로 자르거나 삭제하지 않고 마이그레이션이 실패하므로 배포 전에 확인해야 한다. Railway Server는 dev 자동 배포 및 기존 `npm run db:deploy` Pre-deploy가 설정되어 있으므로, 향후 승인된 PR 병합/배포 시 적용한다. 이번 로컬 구현으로 운영 변경이나 배포가 이루어진 것은 아니다. 추가 환경 변수는 없다.
