# 계정·인증 문의와 관리자 답변

[← API 명세서 목차](README.md)

## 범위와 기준

- 이슈 [#92](https://github.com/MARS-crew/motu-backend/issues/92)와 선행 관리자 이슈 #91. [2차 화면설계서](https://docs.google.com/presentation/d/1enVRxUOunj_8btTQwLHhJdK1t9dmbxcK/edit)의 **USR-AUTH-10 → ADM-INQ-01**을 연결한다.
- **신규 계정·인증 문의 접수는 `POST /api/account-inquiries` 한 경로만 사용한다.** 로그인·문의 토큰·아이디·비밀번호가 필요 없다. 잠금·정지·등록 휴대폰 사용 불가 화면에서 같은 폼으로 진입한다.
- 이전 회원 연결 문의는 삭제하거나 이메일로 재연결하지 않는다. 과거 본인 내역은 읽기 전용으로 보존하고 관리자 목록에서는 접수 경로를 구분한다.
- 회원 잠금·정지 변경, 마이페이지 일반 문의, 첨부파일·SMS·푸시는 별도 범위다.

## 공개 접수 — USR-AUTH-10

**`POST /api/account-inquiries`**, Authorization 없이 접수한다.

```json
{
  "inquiryType": "PHONE_UNAVAILABLE",
  "replyEmail": "reply@example.com",
  "content": "등록한 휴대폰을 사용할 수 없습니다. 변경 절차를 안내해 주세요."
}
```

| 필드 | 규칙 |
|---|---|
| `inquiryType` | 필수. LOGIN_FAILED_LOCKED(계정 잠금), SUSPENDED(계정 정지), PHONE_UNAVAILABLE(등록 휴대폰 사용 불가). 진입 화면의 유형을 전송 |
| `replyEmail` | 필수. 공백 제거 후 유효한 이메일, 최대 255자. 회신 주소이며 소유권 확인을 뜻하지 않음 |
| `content` | 필수. 앞뒤 공백 제거 후 유니코드 문자 기준 1~5000자. 내부 줄바꿈 보존 |

제목은 서버가 생성한다. 회원 존재 여부·계정 상태를 조회하지 않고 `userId=null`, `source=PUBLIC_ACCOUNT_AUTH`로 저장한다. 같은 이메일의 회원이 있어도 추정·연결하지 않는다. `loginId`, `password`, `userId`, `title`, `status`, `source`, 담당자 등 추가 필드는 400으로 거부한다. 비밀번호·인증번호·휴대폰 전체 번호를 본문에 넣지 않도록 화면에 안내한다.

HTTP **201**, `Cache-Control: no-store`:

```json
{
  "success": true,
  "data": {
    "inquiryCode": "INQ-20261118-A1B2C3D4E5F6",
    "status": "SUBMITTED",
    "createDate": "2026-11-18T12:00:00.000Z",
    "message": "문의가 접수되었습니다. 입력하신 이메일로 답변드리겠습니다."
  }
}
```

접수 시 이메일은 보내지 않는다. 관리자가 확인 후 입력 주소로 답변한다. 접수번호는 한국 날짜+난수이며 공개 목록·상세는 제공하지 않는다. 이메일·접수번호만으로 내역을 공개하지 않는다. 같은 내용의 재요청은 새 문의이므로 전송 중 버튼을 비활성화하고 성공 후 반복 제출하지 않는다. 접수 멱등 키는 제공하지 않는다.

### 접수 제한과 운영 프록시 판단

- 회신 이메일별 **1시간 10건**으로 기존 3건보다 완화한다. 대소문자를 같은 주소로 집계하고 정상 저장된 접수만 차감한다. DTO 검증 실패·DB 저장 실패는 한도를 차감하지 않는다.
- 초과 시 **429 `INQUIRY_SUBMISSION_RATE_LIMITED`**. `error.details`의 `retryAfterSeconds`(재시도까지 남은 초), `limit=10`, `windowSeconds=3600`을 사용해 안내한다. 최초 접수부터 1시간이며 거부 요청으로 만료를 연장하지 않는다.
- **IP 제한은 적용하지 않는다.** 2026-11-19 Railway production 확인 결과 공개 도메인은 Nginx에 있고 Server는 비공개다. Nginx가 추가된 전달 경로에서 `trust proxy=1`을 곧바로 실제 사용자 IP 기준이라고 단정할 수 없다. 연결된 Railway 도구는 NGINX_CONFIG 값도 공개하지 않아 헤더 덮어쓰기·추가 규칙은 미확인이다. 따라서 공유 프록시 주소의 전역 차단을 없애는 선택을 한다. 기존 IP guard와 IP 집계 호출을 제거하고 `trust proxy`를 변경하지 않는다.
- 실제 사용자 IP의 신뢰 경계와 모든 진입 경로의 헤더 정제 규칙을 검증하기 전에는 IP 제한을 재활성화하지 않는다. 입력한 `X-Forwarded-For`를 직접 집계 키로 쓰지 않는다. 같은 프록시의 잘못된 요청이 다른 이메일의 정상 접수를 429로 막지 않는다.
- DB 원자적 집계로 여러 인스턴스에서 한도를 공유한다. HMAC 키만 제한 테이블에 저장하며 검증을 통과한 접수 요청에서 만료 행을 최대 100개씩 정리한다. 청소는 카운터 트랜잭션 밖에서 수행해 다른 이메일의 집계 잠금과 교차하지 않게 한다. 과거 IP 키는 만료 뒤 청소되며 더 이상 차단에 사용하지 않는다.
- 이메일 소유 확인이 없으므로 **10건 완화는 타인 주소의 한도 소진 위험을 줄이는 조치이며 이를 완전히 차단하지는 못한다.** IP 제한 중단으로 다수 이메일을 사용하는 대량 접수도 이 API에서 제한하지 않는다. 소유 확인·별도 남용 방지 수단은 화면 흐름과 함께 후속 정책으로 정해야 한다. 확인되지 않은 연락처를 오류 안내에 넣지 않는다.

### 이전 접수 종료와 과거 내역 보존

| API | 현재 동작 |
|---|---|
| `POST /api/inquiries/access-token` | **410 INQUIRY_SUBMISSION_RETIRED**. 비밀번호 확인·토큰 발급 없음 |
| `POST /api/inquiries` | **410 INQUIRY_SUBMISSION_RETIRED**. 토큰이 있어도 신규 접수하지 않음 |
| `GET /api/inquiries?page=1&size=10` | 과거 회원 연결 문의의 본인 목록만 읽기 전용 조회 |
| `GET /api/inquiries/{inquiryId}` | 같은 본인 범위의 상세만 읽기 전용 조회 |

종료한 두 POST는 Swagger에서 숨기며 이 PR 적용 시점부터 새 접수 경로를 병행 운영하지 않는다. 프론트는 토큰 발급 요청을 삭제하고 새 공개 접수 API로 전환해야 한다. 종료 응답은 정상 JSON 요청 기준이며 잘못된 JSON 자체는 공통 파서가 400을 반환할 수 있다.

이전 데이터는 `source=RESTRICTED_ACCOUNT`, 회원 관계·회신 이메일 스냅샷을 그대로 유지한다. 새 공개 문의는 해당 회원의 본인 목록에 포함하지 않는다. 기존 DB CHECK 제약으로 PUBLIC_ACCOUNT_AUTH에 회원을 연결하거나 RESTRICTED_ACCOUNT의 회원 관계를 비울 수 없다.

기존 GET은 정상 계정의 일반 Access 토큰 또는 종료 전에 발급되어 아직 유효한 문의 전용 토큰만 받는다. 문의 토큰의 기존 15분 수명이 끝나면 새 토큰은 발급하지 않는다. 잠금·정지 계정은 공개 접수와 이메일 답변 흐름을 이용한다. 토큰을 갱신하거나 문의를 접수하는 우회 경로는 없다. 문의 토큰은 일반 API·refresh에 사용할 수 없고 타인·회원 미연결 문의는 404로 보호한다. 과거 인증 실패 기록 테이블은 신규 집계를 멈추되 이 PR에서 삭제하지 않는다.

### 관리자 연결

관리자 목록·상세는 `source`로 과거·공개 접수를 구분한다. 관리자에게 회신 주소는 문의에 저장된 값으로 표시하고 현재 가입 이메일에서 다시 가져오지 않는다. 처리 시작 → 내부 답변 저장 → 확인 팝업 → 발송·완료 순서와 공동 처리·중복 발송 방지 정책은 아래 #93 관리자 계약을 사용한다. 회원 미연결 문의도 같은 API로 답변할 수 있다. 이 PR은 최신 #93의 COMPLETED 상태·공동 처리·사용자 메일 안내 변경을 통합했다.

### 적용과 검증

마이그레이션 `20261118120000_add_public_account_inquiries`와 #93의 `20261119110000_rename_inquiry_completed_status`를 포함한다. 새 환경 변수·의존성은 없다. `npm run db:deploy` → `npm run db:generate` → 서버 실행 순서이며 **COMPLETED의 운영 전환 제약은 아래 절차를 먼저 확인한다.** #93 병합 후 이 PR을 dev에 동기화해 병합한다. 프론트 접수 API 전환을 같은 배포에 맞춰야 한다.

```bash
npm run lint
npm test
npm run build
node scripts/verify-public-account-inquiries.mjs
node scripts/verify-admin-inquiries.mjs
node scripts/verify-inquiries.mjs
node scripts/verify-inquiry-status-migration.mjs
```

HTTP·마이그레이션 검증은 localhost 일회용 DB만 사용하고 종료 시 삭제한다. 공개 접수·회원 추정 방지·기존 POST 410·과거 조회 격리·관리자 답변·동시 접수 한도·프록시 합산 차단 제거·저장 실패 롤백·상태 전환 보존을 검증한다. 실제 이메일 발송·운영 데이터 변경은 수행하지 않는다.

## 관리자 계정·인증 문의 관리 — MOTU-30-1-1

이슈 [#91](https://github.com/MARS-crew/motu-backend/issues/91). `[2차 개발]모투화면설계서.pptx`의 **ADM-INQ-01** 기준이다. 일반 마이페이지 문의와 구분하며 관리자 Access 토큰이 필요하다. 사용자 문의 전용 토큰은 관리자 API에 사용할 수 없다.

| API | 기능 |
|---|---|
| `GET /api/admin/inquiries` | 접수번호 검색·상태·유형 필터·페이징 |
| `GET /api/admin/inquiries/{id}` | 상세·회신 주소·담당자·답변 초안·발송 이력 |
| `POST /api/admin/inquiries/{id}/start-processing` | 처리 시작·담당자 지정. 본문 없음 |
| `PATCH /api/admin/inquiries/{id}/reply-draft` | 버전을 확인해 답변 초안 저장 |
| `POST /api/admin/inquiries/{id}/send-reply` | 저장된 답변 발송 및 완료 반영 |

### 목록·상세

목록 쿼리: `keyword`(접수번호 부분 일치, 최대 32자), `status`(SUBMITTED / IN_PROGRESS / COMPLETED), `inquiryType`(LOGIN_FAILED_LOCKED / SUSPENDED / PHONE_UNAVAILABLE), `page`(기본 1, 최대 100000), `size`(기본 20, 최대 100). 필터를 생략하면 전체다. 생성일 내림차순, 같은 시각은 ID 내림차순으로 정렬하며 `items`, `page`, `size`, `totalCount`를 반환한다. 검색의 %, _, 역슬래시는 일반 문자로 처리한다.

상태 표시명은 접수·처리 중·처리 완료다. **처리 완료는 `COMPLETED`이며 회원 계정 승인·잠금 해제를 뜻하지 않는다.** 사용자 문의 목록·상세와 관리자 목록·상세·발송 응답은 모두 같은 상태값을 사용한다. 관리자 목록의 `status=APPROVED`는 더 이상 허용하지 않고 400을 반환한다.

상세 응답은 문의 내용, `replyEmail`, `replyDraft`, `replyVersion`, `assignedAdmin`, `processingStartedAt`, `completedAt`, `canEdit`, `latestReplyAttempt`, `replyAttempts`, `activityLogPath`를 제공한다. 발송 이력은 `attemptPage`(기본 1)·`attemptSize`(기본 10, 최대 50)로 페이지를 나누며 `replyAttempts.items/page/size/totalCount`를 반환한다. 처리 중 문의는 최초 담당자와 관계없이 활성 관리자라면 저장·발송할 수 있다. `canEdit`는 관리자별 소유권이 아니라 문의 상태와 발송 진행 여부를 표시한다. 상세 조회는 상태를 변경하지 않는다. 목록·상세의 `assignedAdmin.nickname`은 관리자 표시 이름으로, 관리자명(없으면 닉네임, 그것도 없으면 아이디)이다.

### 완료 상태 변경과 배포 시 주의

신규 마이그레이션 `20261119110000_rename_inquiry_completed_status`는 PostgreSQL의 `ALTER TYPE "inquiry_status" RENAME VALUE 'APPROVED' TO 'COMPLETED'`로 기존 완료 문의의 상태 이름만 바꾼다. 문의 ID·답변·발송 이력·외래 키·완료 시각은 유지한다. 상장 신청의 `APPROVED`와 발송 결과 `ACCEPTED`는 다른 enum이므로 바꾸지 않는다. 과거 활동 이력 JSON의 `APPROVED`는 당시 기록으로 보존한다.

**기존 사용자 API도 응답 값이 바뀌는 계약 변경이다.** 프론트의 상태 분기·필터·통계와 연계 PR #94의 테스트를 `COMPLETED`로 맞춰야 한다. 기존 `APPROVED` 응답·필터 별칭은 제공하지 않는다. 응답 DTO와 Swagger enum도 `COMPLETED`만 제공한다.

운영 반영 시 이전 서버는 변경된 enum을 읽거나 쓸 수 없으므로 구버전·신버전을 함께 실행하는 무중단 전환을 전제로 하지 않는다. 프론트가 먼저 양쪽 상태를 읽을 수 있게 준비하고, 문의 기능 요청과 배치를 멈춘 상태에서 구버전 서버를 종료한 뒤 마이그레이션과 새 서버를 함께 반영하고 검증한다. 기존 `APPROVED` 필터 요청도 중단 후 `COMPLETED`로 전환한다. 롤백은 새 서버를 먼저 중지하고 enum 이름을 되돌린 뒤 이전 버전을 실행하는 별도 절차가 필요하다. 로컬 검증 스크립트는 일회용 DB에서만 실행하며 운영 DB에 자동 적용하지 않는다.

`node scripts/verify-inquiry-status-migration.mjs`는 기존 `APPROVED` 문의·발송 이력·감사 기록을 준비한 뒤 실제 `prisma migrate deploy`로 전환하고 데이터·enum 보존과 재실행을 검증한다.

### 처리 시작과 회신 주소

처리 시작은 `SUBMITTED → IN_PROGRESS`로 바꾸고 현재 로그인한 관리자와 최초 시작 시각을 기록한다. 처리 중 문의의 재요청은 다른 관리자도 같은 결과를 반환한다. 동시에 시작해도 상태 전환·최초 담당자·시작 이력은 한 번만 저장된다. 담당자 기록은 배타적 권한이 아니며 별도 인계 API 없이 다른 활성 관리자가 이어서 답변할 수 있다. 미배정 기존 문의는 처리 시작으로 보강한다. 새 발송 예약에서 실제 발송 관리자를 담당자로 기록하고, 다른 관리자가 완료 반영을 복구하면 완료 처리 관리자를 기록한다. 발송 시도의 `adminId`에는 최초 발송자 신원을 계속 보존한다.

기존 문의의 회신 이메일은 마이그레이션에서 가입 이메일로 보강한다. 기존 방식의 신규 접수는 종료하며 저장된 과거 문의만 유지한다. 이미 보존된 주소는 회원 이메일이 나중에 바뀌어도 갱신하지 않는다. 미보강 문의에만 처리 시작 시 가입 이메일을 보강한다. 관리자 발송 본문에는 수신 주소를 받지 않으며 확인 팝업에는 상세의 `replyEmail`을 표시한다.

USR-AUTH-10의 비로그인 접수·입력 회신 이메일·회원 미연결 처리와 PHONE_UNAVAILABLE 접수는 후속 [#92](https://github.com/MARS-crew/motu-backend/issues/92)다. 현재 기존 사용자 토큰/접수/조회 계약과 회원 필수 관계는 유지한다. 후속 접수에서도 `replyEmail`을 명시적으로 보존해 이 관리자 API와 연결해야 한다.

### 초안 저장

```json
{
  "expectedVersion": 0,
  "replyText": "안녕하세요. 본인 확인 후 계정 상태 확인 절차를 안내드립니다."
}
```

`expectedVersion`은 상세의 `replyVersion`을 사용한다(최초 0). 답변은 공백 제거 후 1~5000자이며 줄바꿈을 보존한다. 저장할 때 버전을 1 증가시키고 응답으로 새 버전을 제공한다. 오래된 버전으로 다른 내용을 저장하면 409다. 마지막 저장 응답이 유실돼 같은 버전·같은 내용을 재전송하면 기존 결과를 반환한다. 새 발송 요청 전에 저장 완료된 최신 버전으로 확인 팝업을 연다.

처리 중 문의라면 최초 담당자와 관계없이 활성 관리자가 저장할 수 있다. 초안 저장은 상태·담당자를 변경하지 않으며 운영 활동 이력을 생성하지 않는다. 발송 진행 중·발송 결과 불명확·발송 접수 후 완료 반영 대기 중에는 초안을 수정할 수 없다. 확정 실패와 콘솔 모의 발송 후에는 수정할 수 있다. 비밀번호·인증번호 등 인증 비밀을 답변에 포함하지 않는다.

### 화면 버튼과 두 단계 API 계약 (ADM-INQ-01)

화면에 별도의 저장 버튼을 추가하지 않는다. API 내부 저장과 사용자 화면의 최종 발송을 아래처럼 연결한다.

1. 답변 입력이 유효하면 **[이메일 답변 및 완료]**를 활성화한다. 버튼 클릭 시 프론트가 `PATCH /api/admin/inquiries/{id}/reply-draft`에 현재 상세의 `replyVersion`을 `expectedVersion`으로, 입력 내용을 `replyText`로 보낸다.
2. 저장 성공 후에만 확인 팝업을 연다. 팝업에는 회신 주소와 **저장 응답의 `replyDraft` 및 `replyVersion`**을 기준으로 답변을 표시한다. 저장 실패 시 팝업을 열거나 발송하지 않으며 입력은 유지한다.
3. 팝업 **[취소]**는 로컬 입력·저장된 답변·처리 중 상태를 유지한다. 발송 API를 호출하지 않으므로 발송 시도·완료 이력·외부 메일이 생성되지 않는다.
4. 팝업 **[발송]**에서만 `POST /api/admin/inquiries/{id}/send-reply`를 호출한다. 새 `requestId`와 팝업에서 확인한 버전인 `expectedDraftVersion`을 보낸다. 요청 중 버튼을 잠그고 응답 유실 시 동일 키·동일 버전을 재사용한다.
5. 다른 관리자가 팝업을 연 뒤 답변을 변경하면 발송이 409로 차단되고 메일은 보내지 않는다. 로컬 입력을 지우지 말고 최신 상세를 다시 조회해 내용을 비교한 뒤 명시적으로 다시 확인한다. 최신 버전으로 자동 덮어쓰기·자동 발송하지 않는다.
6. 발송 중·불명확 결과·발송 접수 후 완료 반영 대기에서는 초안 편집을 막는다. 원래 발송자 계정이 정지됐어도 다른 활성 관리자가 기존 요청 키로 결과 확인·완료 반영을 이어서 수행할 수 있다. 완료 반영 재시도는 외부 메일을 재발송하지 않는다.

위 절차는 프론트 연결 계약이다. 이 백엔드 저장소에서 실제 프론트 화면을 수정하거나 사용자 입력 보존을 구현한 것은 아니다.

### 이메일 답변 및 완료

```json
{
  "requestId": "7f52b4a4-211c-4c04-9317-1b355dc045bc",
  "expectedDraftVersion": 1
}
```

확인 팝업에서 주소·저장된 답변을 확인하고 [발송]을 눌렀을 때만 요청한다. 취소는 입력을 유지하고 발송 API를 호출하지 않는다. 새 발송은 새 UUID `requestId`, 응답 유실 후 재확인은 **같은 requestId와 같은 버전**을 사용한다. 다른 활성 관리자도 발송 이력에서 기존 키·버전을 확인해 결과 확인·완료 반영을 복구할 수 있다. 같은 키를 다른 버전·사유로 재사용하면 409이며, 처리자가 달라도 새 메일은 발송하지 않는다. 수신자·발신 관리자·임의 답변 본문은 발송 요청에 받지 않는다. 서버가 저장된 답변·회신 주소를 스냅샷으로 확정한다.

| 발송 이력 status | 문의 상태·처리 |
|---|---|
| `SENDING` | 처리 중. 같은 키 재요청은 결과 대기 안내, 다른 키 발송도 차단 |
| `ACCEPTED` | Brevo 발송 요청 접수 성공. 처리 완료(COMPLETED) 및 `completedAt` 반영 |
| `FAILED` | 공급자 확정 거절. 처리 중·초안 유지, 503. 같은 키는 실패 결과만 반환 |
| `UNKNOWN` | 타임아웃·네트워크 유실·공급자 서버 오류 등 발송 여부 불명확. 처리 중·초안 유지, 자동 재발송 없음 |
| `SIMULATED` | 콘솔 로그 모의 발송. HTTP 200이나 `simulated=true`, 처리 중 유지·완료 시각 없음 |

기존 Brevo `MailSender`를 재사용한다. `BREVO_API_KEY`가 없는 로컬 환경에서는 로그만 출력한다. 운영은 기존 환경 변수 검증에서 Brevo 설정이 필수다. **Brevo 접수 성공은 실제 수신함 도착을 보장하지 않는다.** 반송·수신 확인 웹훅은 이번 범위에 포함하지 않는다. 제목에는 문의번호를 넣고 본문은 평문으로 전송한다. 메일 말미에는 사용자 안내인 “계정 잠금 해제 및 이용 제한 변경은 본인 확인 후 별도로 처리됩니다.”를 넣는다. 본인 확인만으로 해제·변경이 확정된다는 의미는 아니다.

답변 완료는 계정의 잠금·정지 상태·로그인 실패 횟수·세션을 바꾸지 않는다. 회원 조치는 기존 회원 관리에서 별도로 처리한다.

### 불명확한 결과와 재발송 확인

요청이 2분 이상 SENDING에 남으면 조회 시 UNKNOWN으로 표시하고 자동 재발송하지 않는다. 조회는 DB를 변경하지 않는다. 이어받은 활성 관리자도 Brevo의 수신 주소·문의번호·발송 시각으로 기존 발송 기록을 확인한다. 같은 키로 재요청해도 메일을 다시 보내지 않는다.

확인 후 같은 답변을 다시 보내기로 명시적으로 결정했을 때만 **새 requestId**, 현재 답변 버전, `confirmResend: true`, 사유를 보낸다. 이미 전달됐을 가능성과 중복 수신 가능성을 확인 팝업에서 안내한다.

```json
{
  "requestId": "feb3eaa9-6d95-49e2-af12-24b3c65fb269",
  "expectedDraftVersion": 1,
  "confirmResend": true,
  "retryReason": "공급자 발송 이력 확인 후 재발송에 동의했습니다."
}
```

사유는 1~200자다. 불명확한 이전 시도가 없으면 이 확인 필드를 허용하지 않는다. 확정 실패의 재시도는 새 키·현재 버전으로 일반 발송한다. 이전 발송 시도와 사유는 계속 보존한다. 외부 메일과 DB 사이에 분산 트랜잭션이 없으므로 임의 네트워크 장애에서도 정확히 한 번 전달되는 것을 보장하지 않는다.

### 트랜잭션과 활동 이력

1. 문의 행 `FOR UPDATE` 잠금 안에서 상태·초안 버전을 확인하고 실제 발송 처리자를 기록하며 SENDING 시도와 발송 요청 활동 이력을 함께 저장한다. 이 단계 실패 시 외부 발송을 실행하지 않는다.
2. DB 트랜잭션 밖에서 메일을 발송한다. 공급자 결과와 발송 접수 ID를 별도 저장한다.
3. 결과에 따른 문의 완료·완료 시각·결과 활동 이력을 같은 트랜잭션으로 반영한다. 활동 이력 실패 시 완료 상태를 롤백한다. 이미 보존된 ACCEPTED 결과는 유지하므로 동일 키 재요청은 외부 메일을 재발송하지 않고 완료·이력 반영만 재시도한다.

발송 직후 DB 장애로 결과를 기록하지 못하면 SENDING에 남아 결과 확인이 필요한 상태가 된다. 자동 재발송하지 않는다. 서버 재시작 후에도 DB의 키·발송 시도 기록으로 중복 요청을 판정한다.

`activityLogPath` 또는 `GET /api/admin/activity-logs?targetType=INQUIRY&targetId={문의 ID}`로 조회한다. 활동 이력 화면에 **문의(INQUIRY)** 대상과 **INQUIRY_START(처리 시작)**, **INQUIRY_REPLY_SEND(발송 요청·결과)** 선택지를 추가해 연결한다. 발송 요청과 결과는 별도 기록이며 실패는 FAILURE, 모의 발송은 결과 값 SIMULATED로 구분한다. 초안 저장마다 운영 이력을 생성하지 않는다. 기존 `INQUIRY_REPLY_DRAFT_SAVE` enum·필터는 과거 이력 조회 호환용으로 유지하며 과거 행·마이그레이션을 수정하지 않는다.

### 오류

| HTTP / code | 의미 |
|---|---|
| 400 `BAD_REQUEST` | UUID·페이지·버전·답변 형식/길이 오류, 임의 수신자·담당자 입력 |
| 400 `INQUIRY_REPLY_EMAIL_REQUIRED` | 유효한 회신 주소 없음 |
| 400 `INQUIRY_REPLY_DRAFT_REQUIRED` | 저장 답변 없음 |
| 404 `INQUIRY_ADMIN_NOT_FOUND` | 문의 없음 |
| 409 `INQUIRY_ADMIN_INVALID_STATUS` | 완료 상태 등에서 처리 시도 |
| 409 `INQUIRY_REPLY_VERSION_CONFLICT` | 오래된 초안 버전 |
| 409 `INQUIRY_REPLY_REQUEST_CONFLICT` | 같은 키를 다른 버전·재발송 사유에 재사용 |
| 409 `INQUIRY_REPLY_SENDING` | 발송 진행 중 또는 발송 중 초안 변경 |
| 409 `INQUIRY_REPLY_RETRY_CONFIRMATION_REQUIRED` | 불명확한 결과 확인 없이 새 발송 시도 |
| 503 `INQUIRY_REPLY_SEND_FAILED` | 발송 확정 실패. 초안·처리 중 상태 보존 |
| 503 `INQUIRY_REPLY_DELIVERY_UNKNOWN` | 발송 여부 불명확. 외부 이력 확인 필요 |

### 로컬 검증

마이그레이션 `20261118110000_add_admin_inquiry_replies`는 기존 문의와 가입 이메일을 보존하면서 회신 주소·담당자·초안·발송 시도를 추가한다. `npm run db:deploy` → `npm run db:generate` → `npm run start:dev` 순서로 로컬에 적용한다.

- `npm run lint`, `npm test`, `npm run build`
- `node scripts/verify-admin-inquiries.mjs`: 별도 일회용 localhost DB에 모든 마이그레이션을 적용한다. 실제 HTTP·DB와 모의 공급자로 권한·조회·담당자 경합·초안 버전·동시 발송·확정 실패·타임아웃·명시적 재발송·중단 요청·발송 후 완료 반영 재시도·활동 이력 롤백·수신 주소 보존·계정 상태 유지를 검사한다. 외부 메일을 발송하지 않고 DB를 정리한다.
- `node scripts/verify-inquiries.mjs`: 이전 접수·토큰 발급 410 종료와 과거 본인 조회·토큰 격리·데이터 보존 회귀 검증.
- `node scripts/verify-public-account-inquiries.mjs`: 비로그인 세 유형 접수 → 관리자 검색·상세·담당자 지정 → 답변 저장·모의 공급자 발송 → 완료까지 검증한다. 회원 추정 연결 방지·본인 조회 차단·회신 주소 보존·계정 상태 유지·중복 발송·실패 초안 보존·콘솔 미완료·여러 인스턴스의 접수 제한·만료·롤백도 확인한다. 일회용 로컬 DB를 사용하고 정리하며 실제 메일은 보내지 않는다.

이슈 #92의 마이그레이션 `20261118120000_add_public_account_inquiries`는 기존 문의를 삭제하지 않고 회원 관계를 선택 사항으로 만들며 접수 경로·공개 접수 제한 테이블과 경로별 회원 연결 DB 제약을 추가한다. 관리자 기능(PR #93)이 선행 의존성이다. 로컬 적용 명령은 `npm run db:deploy` → `npm run db:generate` → `npm run start:dev`다.

비로그인 흐름을 Swagger에서 확인할 때:

1. `http://localhost:3000/api/docs`에서 인증 없이 **Inquiries → POST /api/account-inquiries**를 실행한다. 위 JSON의 회신 주소를 테스트할 주소로 바꾼다. 201 응답의 `inquiryCode`를 기록한다.
2. 관리자 계정으로 `POST /api/auth/login`을 실행하고 Access 토큰을 Authorize에 등록한다.
3. `GET /api/admin/inquiries`의 `keyword`에 접수번호를 넣는다. 결과 항목의 `id`와 `source=PUBLIC_ACCOUNT_AUTH`를 확인한다.
4. `GET /api/admin/inquiries/{id}`에서 입력한 회신 주소·내용을 확인한 뒤 `POST /api/admin/inquiries/{id}/start-processing` → `PATCH /api/admin/inquiries/{id}/reply-draft` 순서로 실행한다. 초안 본문은 위 예시의 `expectedVersion=0`, `replyText`를 사용한다.
5. `POST /api/admin/inquiries/{id}/send-reply`에 새 UUID인 `requestId`와 초안 응답의 버전인 `expectedDraftVersion`을 보낸다. Brevo 접수 성공이면 상세가 COMPLETED·완료 시각 있음, 로컬 콘솔 발송이면 SIMULATED·IN_PROGRESS·완료 시각 null이 정상이다. 실제 수신 확인은 Brevo 설정과 수신 주소를 확인한 경우에만 수행한다.

Swagger 수동 테스트는 제한 계정 문의 접수 후 관리자로 로그인해 Admin - Inquiries에서 목록·상세 → start-processing → reply-draft → send-reply 순서로 진행한다. 초안 응답의 버전을 발송에 넣는다. 로컬 로그 모의 발송에서는 처리 중을 유지하는 것이 정상이다. 실제 메일 테스트는 사용할 수신 주소와 Brevo 설정을 확인한 별도 테스트에서 수행한다.
