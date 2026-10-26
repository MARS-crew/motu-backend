# 상장 신청 저장·조회

본인 보완 요청 조회·기한 검사와 증빙 재제출은 [보완 요청·재제출](listing-revisions.md)을 참고한다. 재제출 시 기존 신청번호를 유지하고 검토 중으로 전환하며, 제출한 증빙 묶음은 변경을 차단한다.

관련 이슈: #33. MOTU-30-02-01, MOTU-32-02-01~03.

단계별 저장·조회 추가: [#36](https://github.com/MARS-crew/motu-backend/issues/36). MOTU-36-02-01, MOTU-38-01-01~02. 이번 범위는 4단계 입력 저장과 본인 상세·상태 조회다. 최종 제출, 신청번호 발급, 제출에 따른 상태 전환, SMS/2차 보안 연동은 후속 작업이다.

## 화면·요구사항 근거

- [1차 개발 SRS](https://docs.google.com/spreadsheets/d/1Yyk_KWuRlCEWIedvOdFgjUvsCJL54SwqT4zrGmPuCMA/edit?gid=1313656183): 상장 신청 진입·기본 정보·증빙 처리. 작성 단계에서는 2차 보안을 요구하지 않고 임시저장은 필수값 없이 허용한다.
- [1차 개발 IA](https://docs.google.com/spreadsheets/d/18IZuGCG0WY9OYwqpgGDTa3rN43op8eiumYNFRp6DHdY/edit?gid=748545779): Listing 01-01 진입, 02~05 입력 단계, 08-01 내 상장 신청.
- [화면설계서](https://docs.google.com/presentation/d/1432WUouwlx6Jp-_mh67lpIPurlO5ja5X/edit): 41쪽 USR-LST-01-01, 53쪽 USR-LST-08-01. 최근 저장순 2건 미리보기, 계정당 임시저장 5건, 마지막 저장 후 90일 만료, 7일 전 안내, 동일 공식 URL의 진행 중 신청 중복 금지.
- 제공된 ERD의 ListingApplication·User 관계를 따른다. 이 작업 시작 시 dev에는 상장 신청 모델이 없어 `ListingApplication`을 추가했다.

## API

공통 prefix는 `/api`. 모두 로그인 필요, 본인 신청서만 처리한다. 타인 ID는 404다. 작성 중에는 SMS/최종 제출을 요구하지 않는다.

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/listing-applications/drafts` | 최초 임시저장. 빈 객체도 가능. 201 |
| GET | `/listing-applications/drafts?limit=2` | 진입 화면 미리보기. 최신 2건과 전체 유효 건수 |
| GET | `/listing-applications/drafts` | 작성 중 전체 목록. 기본 limit=5 (1~5) |
| GET | `/listing-applications/drafts/:id` | 이어서 작성할 단계·입력값 조회 |
| PATCH | `/listing-applications/drafts/:id` | 해당 필드만 수정, 마지막 저장 시각과 만료 시각 갱신 |
| DELETE | `/listing-applications/drafts/:id` | 소프트 삭제. 200, 공통 성공 응답 data=null |

생성/수정 예시:

```json
{
  "currentStep": 2,
  "data": {
    "serviceName": "SaaS Index",
    "officialUrl": "https://example.com",
    "summary": "아직 작성 중",
    "desiredPrice": "10000"
  }
}
```

`currentStep`은 1 기본 정보, 2 평가·거래, 3 지표, 4 증빙이다. `data`를 생략하면 기존 데이터를 유지하며, PATCH는 필드 단위로 병합한다. `null` 또는 공백 문자열은 해당 입력값을 비운다. 단순 조회는 만료 시각을 연장하지 않는다. 명시적 PATCH 저장은 빈 객체여도 저장 시각을 갱신한다.

필수값·최소 글자 수·숫자/이메일/날짜 완성도는 임시저장에서 검사하지 않는다. 저장 길이, 타입 및 알려진 필드 여부는 검사한다. 숫자와 날짜는 미완성 입력을 보관하도록 문자열로 받는다(예: `desiredPrice: ""`, `metricsStartDate: "2026-"`). 서버 전용 `userId`, `status`, `applicationNumber`는 요청할 수 없다. 공식 URL은 입력한 경우 HTTPS 형식을 검사한다.

`data`의 허용 필드는 Swagger의 `ListingDraftDataReqDto`에 정의되어 있다. 기본 정보·평가/거래·지표·증빙 입력값을 저장한다. 위 기존 임시저장 API는 다음 단계 이동에 대한 필수값 검증이나 최종 제출을 수행하지 않는다. 단계 완료를 검사하며 저장하려면 아래 PUT API를 사용한다.

## 단계별 검증·저장 (#36)

`PUT /api/listing-applications/drafts/:id/steps/:step` (200). `step`은 1~4다. 해당 단계의 변경 필드만 `data`로 보내며, 기존 입력값과 병합한 뒤 **해당 단계 전체**를 검증한다. 다른 단계의 입력은 유지한다. 단계를 순서대로 강제하거나 이전 단계의 완료를 보증하는 API는 아니다.

| 단계 | 필드와 검사 |
|---|---|
| 1 기본정보 | `serviceName` 2~30자, `summary` 10~60자(줄바꿈 금지), 유효한 `sectorCode`, 저장 완료 대표 이미지 `mainImageCollectionId`, `operatorName`, `managerName`, `businessEmail`, 휴대폰 형식의 `contactPhone` 필수. `description` 최대 500자, HTTPS `officialUrl`, `logoCollectionId`는 선택 |
| 2 평가·거래 | `desiredPrice`, `totalIssuedQuantity`는 0보다 큰 정수 문자열, `priceCalculationBasis` 필수. 선택한 `minOrderQuantity`, `tickSize`는 `"1"`, `"5"`, `"10"`, `"50"`, `"100"`. `desiredListingDate`는 입력 시 시간대를 포함한 미래 ISO 일시 |
| 3 서비스지표 | MAU·DAU·매출·거래액은 정수 문자열이며 0 허용. 입력한 지표에 대응하는 기준일/집계 기간·출처·추출일을 함께 검사. 기간은 시작≤종료, 최대 12개월, 추출일은 종료일 이상, 날짜는 KST 오늘 이하 |
| 4 증빙자료 | `evidenceDescription` 10~500자. `evidenceCollectionId`는 제공 시 본인 EVIDENCE 묶음인지 확인. 파일·링크 합산 최대 10개이며 저장 완료(`saved=true`) 자료만 연결 |

3단계의 지표별 필드는 다음과 같다.

| 지표 | 함께 보내는 필드 |
|---|---|
| `mau` | `mauSource`, `mauReferenceMonth` (YYYY-MM) |
| `dau` | `dauSource`, `dauReferenceDate` (YYYY-MM-DD) |
| `revenue` | `revenueStartDate`, `revenueEndDate`, `revenueSource`, `revenueExtractDate` |
| `transactionVolume` | `metricsStartDate`, `metricsEndDate`, `transactionVolumeBasis` (`LAST_12_MONTHS` / `SINCE_LAUNCH`), `transactionVolumeSource`, `transactionVolumeExtractDate` |

지표 전체의 필수 조합, 증빙 최소 개수, 회계연도 기준과 거래액 집계 기간의 자동 산출은 문서 간 확정이 필요한 정책이다. 이번 단계 저장에서는 지표 4개 모두나 증빙 최소 1개를 임의로 강제하지 않는다. 입력된 지표의 형식·기간·출처 정합성을 검사하며, 최종 제출 시의 완결성 검증으로 간주하면 안 된다. 최소 주문 수량/호가 단위의 기본값도 서버에서 임의로 채우지 않는다.

기본정보 예시(대표 이미지 묶음 ID는 파일 API에서 업로드 후 저장한 실제 ID로 교체):

```json
{
  "data": {
    "serviceName": "MOTU 서비스",
    "summary": "상장 신청을 진행할 서비스의 한 줄 소개입니다.",
    "sectorCode": 1,
    "mainImageCollectionId": "파일 API에서 만든 MAIN_IMAGE 묶음 UUID",
    "operatorName": "모투",
    "managerName": "홍길동",
    "businessEmail": "owner@example.com",
    "contactPhone": "010-1234-5678"
  }
}
```

응답은 기존 임시저장 상세에 `validatedStep`을 추가한다. `currentStep`에는 이번에 저장한 단계를 기록하고, `lastSavedAt`과 90일 만료 시각을 갱신한다. `validatedStep`은 이번 요청에서 검사한 단계를 뜻하며, 영구적인 전체 완료 상태가 아니다. 이후 임시저장으로 값을 바꾸었다면 다시 검사해야 한다.

검증 실패 시 `LISTING_STEP_VALIDATION_FAILED`(400)의 `error.details = { step, fields: [{ field, message }] }`로 한글 필드 오류를 제공한다. 저장 내용과 저장/만료 시각은 롤백한다. 잘못된 단계는 `LISTING_INVALID_STEP`(400), DTO 타입/UUID/길이 오류는 공통 `BAD_REQUEST`(400)다. 파일 묶음 소유권·용도·저장 완료 여부는 FilesService를 통해 확인하며, 저장 트랜잭션이 파일 묶음을 잠가 동시에 선택/삭제되는 요청과 직렬화한다.

## 본인 상세·상태 조회 (#36)

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/listing-applications/:id` | 본인 신청 상세. DRAFT 및 접수 이후 실제 저장 상태/입력값/저장 완료 첨부 반환 |
| GET | `/api/listing-applications/:id/status` | 본인 신청 상태와 신청번호·접수일·검토 의견·보완 기한·수정 가능 여부 조회 |

두 API 모두 로그인 필요. 타인/삭제/없는 신청서는 404이며 타인의 첨부도 노출하지 않는다. 상세의 `attachments`는 `{ logo, mainImage, evidence }`이며, 각 값은 저장 완료 자료만 담은 작성 묶음 또는 `null`이다. 다운로드는 묶음의 `attachments[].downloadPath`를 파일 API에서 인증 헤더와 함께 호출한다.

상태 응답의 `statusLabel`은 DRAFT(임시 저장), SUBMITTED(접수), UNDER_REVIEW(검토 중), REVISION_REQUESTED(보완 요청), APPROVED(승인), REJECTED(반려), EXPIRED(만료)다. `isEditable`은 유효한 DRAFT에서만 true다. 접수 이후 상태에는 임시저장의 만료 정책을 적용하지 않아 `expiresAt`을 null로 반환한다. 만료된 임시저장의 상세는 410, 상태 조회는 200/EXPIRED다.

`applicationNumber`, `submittedAt`, `reviewComment`, `revisionDeadline`은 DB에 기록된 값만 반환하고 미기록 값은 null이다. 접수일·검토 의견·보완 기한용 nullable 컬럼만 추가했으며, 이 값을 생성/변경하는 제출·관리자 API는 이번에 추가하지 않는다. 현재 실제 사용자 흐름에서는 저장 후 계속 DRAFT다. 접수 이후 상태 조회의 자동 검증에는 **로컬 전용 테스트 데이터**를 사용한다.

첨부는 현재 작성 묶음의 저장 완료 자료를 조회한다. 제출 당시 첨부의 불변 스냅샷 및 제출 후 파일 변경 차단은 후속 제출 기능에서 구현해야 한다.

### Swagger 확인 순서

1. 서버를 재시작하고 로그인·Authorize한다.
2. 기존 `POST /api/listing-applications/drafts`에 `{}`를 보내 신청서 `id`를 얻는다.
3. `GET /api/sectors`로 실제 카테고리 코드를 확인한다. 파일 API에서 MAIN_IMAGE 묶음 생성 → 이미지 업로드 → `PUT /api/files/collections/:id`에 업로드한 attachmentIds를 보내 저장한다.
4. `Listing applications - Drafts`의 PUT `.../:id/steps/:step`에서 step=1로 위 기본정보를 저장한다. step=2는 가격·수량·산정 근거, step=3은 지표와 출처/날짜, step=4는 증빙 설명과 선택한 EVIDENCE 묶음을 저장한다.
5. `Listing applications - Queries`에서 GET `/:id`로 네 단계 입력과 저장 완료 첨부를 확인한다. GET `/:id/status`는 DRAFT, `isEditable=true`, `applicationNumber=null`, `submittedAt=null`이어야 한다.
6. 단계 필수값 누락/잘못된 날짜는 400이며 이전 저장값이 유지되는지 확인한다. 다른 사용자 토큰으로 같은 ID를 조회하면 404다. 미완성 내용을 보관하려면 기존 PATCH 임시저장을 계속 사용한다.

## 목록과 5건 제한

응답 예시의 `items`는 최근 저장일시 내림차순, 동일 시각이면 ID 내림차순이다.

```json
{
  "success": true,
  "data": {
    "items": [],
    "totalCount": 0,
    "maxCount": 5,
    "canCreate": true
  }
}
```

`totalCount`는 limit와 관계없이 본인의 유효한 DRAFT 수다. 만료·삭제·접수 이후 상태는 제외한다. items에는 id, serviceName(미입력 null), status, currentStep, lastSavedAt, expiresAt, expiresSoon을 제공한다. 상세·생성·수정 응답에는 data와 applicationNumber도 포함한다. 임시저장에는 접수번호를 발급하지 않으므로 applicationNumber는 null이다.

같은 회원의 생성·수정·삭제는 users 행의 `FOR UPDATE` 잠금으로 직렬화한다. 여러 서버나 동시 요청에서도 5건 초과를 막는다. 기존 신청서는 5건인 상태에서도 수정할 수 있다. 삭제·만료되면 빈자리를 사용할 수 있다.

## 90일 만료

- expiresAt = 마지막 저장 시각 + 90×24시간. UTC 시각을 저장하고 프론트에서 KST 등으로 표시한다.
- 현재 시각이 expiresAt에 도달하거나 지나면(정확히 90일 경계 포함) 유효하지 않다. 목록·한도에서 즉시 제외하며 상세/수정은 `LISTING_DRAFT_EXPIRED`(410)다.
- `expiresSoon`은 만료까지 7일 이하 남았을 때 true다. 프론트 안내 배너용이며 이메일/SMS/푸시 알림 발송은 포함하지 않는다.
- 서버 시작 시와 15분마다 유효한 DRAFT의 만료 7일 전 **앱 내 알림**을 1회 생성한다. 저장 연장·삭제·접수 건은 잠금 후 재확인하며 제외한다. 새 만료일은 별도 안내 주기로 취급한다. 기존 안내는 이력으로 보존한다. 알림 목록·읽음·미확인 수와 생산자 계약은 [알림](notifications.md)을 참고한다.
- 서버 시작 시 및 15분마다 DRAFT를 EXPIRED로 변경한다. 요청 처리에서도 만료를 판정하므로 주기 작업 실패·서버 중지 기간이 있어도 만료된 신청서를 이어서 저장할 수 없다.
- 접수·검토·보완 중인 신청서는 이 만료 작업으로 변경하지 않는다. 파일 객체와 신청서 이력은 물리 삭제하지 않는다.

## 진행 중 공식 URL 중복

중복 범위는 **전체 계정**이다. DRAFT, SUBMITTED, UNDER_REVIEW, REVISION_REQUESTED 상태에서 동일 URL을 하나만 허용한다. 승인·반려·만료·삭제 건은 점유를 해제한다. 빈 URL은 중복 검사에서 제외한다.

URL 정규화 정책: HTTPS만 허용, 앞뒤 공백 제거, 호스트 소문자/국제 도메인 및 기본 443 포트는 표준 URL 파서 사용, fragment 제거, 경로 후행 슬래시 제거, 쿼리 키 순서 정렬. 경로 대소문자·쿼리 값·www 유무는 구분한다. 서버는 해당 URL에 접속하지 않는다. 이는 문서에 세부 규칙이 없는 부분에 대한 구현 기준이다.

PostgreSQL 부분 UNIQUE 인덱스 `listing_applications_active_url_key`가 동시 중복 등록을 최종 차단한다. 만료된 타인 신청서의 URL도 새 요청에서 즉시 해제한다. 중복 시 생성·수정을 롤백하며 기존 신청 내용은 유지한다. 후속 제출/심사 기능도 status·normalizedOfficialUrl을 같은 테이블에서 관리해야 이 제약이 유지된다.

## ERD·파일 기능·후속 작업

ERD의 최종 제출 필드는 미입력 임시저장과 양립하도록 이번에는 draftData(JSONB)에 보관한다. 검색/제약에 필요한 소유자·서비스명·URL·상태·단계·저장/만료일은 별도 컬럼이다. 최종 제출 모듈에서 draftData를 필수값/형식 검증하고 ERD의 정형 필드·신청번호·신청 상태로 전환해야 한다. 현재 접수·심사·보완 API는 제공하지 않는다.

logoCollectionId / mainImageCollectionId / evidenceCollectionId는 기존 [파일 API](files.md)의 작성 묶음 ID다. FilesService.getSavedCollection으로 소유자와 용도를 확인한다. 파일 ID나 임의 URL을 업로드 완료 자료로 간주하지 않는다. 이어서 작성할 때 파일 API로 해당 묶음의 saved 자료를 조회한다. 본 작업은 최종 제출 시 파일 불변 스냅샷이나 신청서-파일 FK를 구현하지 않는다. 임시저장 삭제/만료 시 파일을 함께 물리 삭제하지 않는다.

## 오류

| 코드 | 상태 | 의미 |
|---|---|---|
| BAD_REQUEST | 400 | 타입·최대 길이·단계·경로·limit 오류. DTO/경로 문구는 한글 |
| LISTING_INVALID_URL | 400 | HTTPS 공식 URL 형식 위반 |
| LISTING_INVALID_ATTACHMENT | 400 | 첨부 묶음 용도 불일치 |
| FILE_NOT_FOUND | 404 | 첨부 묶음이 없거나 다른 소유자 |
| LISTING_APPLICATION_NOT_FOUND | 404 | 신청서 없음/다른 소유자/삭제됨 |
| LISTING_DRAFT_EXPIRED | 410 | 90일 만료 |
| LISTING_DRAFT_LIMIT_EXCEEDED | 409 | 유효한 임시저장 5건 초과 |
| LISTING_URL_IN_PROGRESS | 409 | 동일 공식 URL 진행 중 |
| LISTING_APPLICATION_NOT_DRAFT | 409 | 접수 이후 상태 변경 시도 |
| LISTING_DRAFT_CONFLICT | 409 | 제한된 재시도로도 동시성 충돌 해결 실패 |

## 로컬 검증·배포

이번 변경은 `20261025055930_add_listing_application_query_metadata` 마이그레이션을 포함한다(기존 컬럼/행 삭제 없이 nullable 컬럼 3개 추가). 로컬에서는 마이그레이션 적용 후 Prisma Client를 생성하고 빌드한다. 운영 적용은 기존 Railway 배포 절차의 `npm run db:deploy`로 진행하며, 이 작업에서는 운영 DB/변수를 수정하지 않았다.

`node scripts/verify-listing-steps.mjs`는 3091 포트의 로컬 테스트 서버에서 단계별 검증/롤백, 저장 완료 첨부, 동시 단계 저장, 본인 상세·상태 조회, 접수 이후 변경 차단 및 만료/삭제를 검사한다. localhost DB와 전용 테스트 계정만 사용하고 완료 후 계정·신청서·첨부/파일을 정리한다. 기존 임시저장 회귀 검증은 아래 스크립트로 계속 실행한다.

로컬 DB를 실행하고 `npm run db:migrate`로 새 마이그레이션을 적용한 뒤 `npm run db:generate`, `npm run build`를 실행한다. `node scripts/verify-listing-drafts.mjs`는 localhost DB만 허용하고 로컬 seed 계정의 암호 해시를 복제한 전용 테스트 계정 두 개로 검증한다. 테스트 서버는 3090 포트와 로컬 파일 저장소를 사용한다. 생성한 신청서·첨부 묶음·테스트 계정/세션은 finally에서 정리한다. 기존 사용자의 신청서는 수정하지 않는다.

Swagger: 로그인·Authorize → POST drafts → PATCH 단계/입력값 저장 → GET 목록(limit=2/5) → GET 상세 → DELETE 순서로 확인한다. 6번째 생성은 409, 동일 공식 URL 생성/수정은 409다.

Railway는 조회 시 MOTU production의 Server/Postgres/Nginx/Web/MinIO가 Online이었다. 이 작업은 운영 변수·DB·배포를 변경하지 않는다. dev 병합 후 기존 배포 절차에서 `npm run db:deploy`로 마이그레이션을 반영해야 한다. 새 환경 변수나 외부 스케줄러는 필요하지 않다.
