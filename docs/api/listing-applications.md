# 상장 신청 저장·조회·관리자 심사

## 탈퇴 회원의 승인·발행 차단 (#88 연계)

- 승인과 실제 거래 시작은 신청자의 `accounts.account_id` 행에 `FOR UPDATE` 잠금을 얻고, **잠금 이후 별도 SQL에서 회원 상태를 다시 조회**한다. #88의 `SettlementService.lockAccounts`와 동일한 행 잠금을 사용한다. 승인에서는 신청서 → 계좌, 거래 시작에서는 상품 → 계좌 순서이며 잠금을 잡은 채 외부 작업을 기다리지 않는다.
- `WITHDRAWN`이면 승인은 **409 `LISTING_ISSUER_WITHDRAWN`**. 상품·승인 상태·첨부 동결·승인 활동 이력을 저장하지 않는다. 로그인 잠금(`LOCKED`)·정지(`BLOCKED`)까지 탈퇴로 간주하지 않는다.
- 거래 시작 직전 탈퇴가 확인되면 발행 주식·최초 매도 주문·호가 등록·ACTIVE 전환을 실행하지 않는다. 상품은 **PENDING 유지**하고 `listingBlockedAt`, `listingBlockedReason="신청자 탈퇴로 발행 보류"`를 저장한다. 보류 기록은 커밋한 뒤 같은 오류를 반환하므로 실패 예외로 보류 기록이 롤백되지 않는다.
- 예약 처리에서는 `listingBlockedAt=null`인 상품만 처리한다. 다른 서버나 직접 호출도 기존 보류를 유지하며 보류 시각을 덮어쓰지 않는다. 자동 재시도·자동 해제는 없다. 관리자 신청 상세 응답의 `listingBlockedAt`, `listingBlockedReason`으로 확인한다. 승인 이력은 APPROVED로 보존한다.
- 조회·발행 실패 로그에는 오류 원인과 stack을 남긴다. 탈퇴 보류는 일반 일시 오류와 구분한다.
- 신규 마이그레이션: `20261119060000_add_listing_activation_hold`. 기존 상품 데이터는 보존하고 보류 필드를 null로 추가한다. `npm run db:deploy` 후 `npm run db:generate`를 적용한다.

### #88 담당자와 맞출 탈퇴 계약

탈퇴 처리도 동일 계좌 행을 잠근 **후**, 본인 신청서의 `APPROVED`와 연결 상품의 `PENDING`·미삭제 여부를 확인하고 있으면 **409**로 차단해야 한다. 이 거부로 주문 취소·포인트 소멸·회원 상태·토큰 폐기도 모두 롤백해야 한다. 접수·검토 중·보완 요청만으로는 탈퇴를 차단하지 않는다. 이 계약을 지켜야 승인이 먼저 완료된 경우 탈퇴가 차단되고, 탈퇴가 먼저 완료된 경우 승인이 차단된다.

본 변경은 #90 범위이며 #88의 탈퇴 API는 수정하지 않는다. #88의 `WITHDRAWN` 상태값을 텍스트로 판정하므로 해당 enum이 없는 기존 dev에서도 실행 가능하다. 상태값·스키마 반영 후 두 PR의 실제 탈퇴 API까지 통합 검증해야 한다.

`node scripts/verify-admin-listing-review.mjs`는 일회용 로컬 DB에만 #88의 WITHDRAWN enum을 준비한다. 실제 승인 HTTP API와 거래 시작 서비스에 대해 계좌 잠금 대기·탈퇴 선행·승인 선행·보류 저장·관리자 조회·재시도 제외를 검증한다. 탈퇴 쪽은 같은 DB 잠금·PENDING 검사 계약을 재현하며 **#88 탈퇴 엔드포인트 자체를 검증한 것은 아니다**.

본인 보완 요청 조회·기한 검사와 증빙 재제출은 [보완 요청·재제출](listing-revisions.md)을 참고한다. 재제출 시 기존 신청번호를 유지하고 검토 중으로 전환하며, 제출한 증빙 묶음은 변경을 차단한다.

운영자의 심사 대상 조회는 [관리자 상장 신청 조회·서류 다운로드](#관리자-상장-신청-조회서류-다운로드)를 참고한다.

관련 이슈: #33. MOTU-30-02-01, MOTU-32-02-01~03.

단계별 저장·조회 추가: [#36](https://github.com/MARS-crew/motu-backend/issues/36). MOTU-36-02-01, MOTU-38-01-01~02. 해당 이슈에서 4단계 입력 저장과 본인 상세·상태 조회를 추가했다. 관리자 심사 처리는 이슈 #89에서 추가하며, 최초 최종 제출·신청번호 발급·DRAFT → SUBMITTED 전환·SMS/2차 보안 연동은 후속 작업이다.

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
| 3 서비스지표 | 지표·출처·기준일·집계 기간·추출일 모두 선택 입력. MAU·DAU·매출·거래액은 입력 시 0 이상 정수 문자열. 입력된 날짜는 KST 오늘 이하이며, 비교할 날짜가 모두 있을 때 시작≤종료·최대 12개월·종료≤추출일 검사. 다른 항목의 동반 입력을 강제하지 않음 |
| 4 증빙자료 | `evidenceDescription` 10~500자. `evidenceCollectionId`는 제공 시 본인 EVIDENCE 묶음인지 확인. 파일·링크 합산 최대 10개이며 저장 완료(`saved=true`) 자료만 연결 |

3단계의 지표별 관련 필드는 다음과 같다. 표의 관련 필드도 각각 선택 입력이다.

| 지표 | 관련 선택 필드 |
|---|---|
| `mau` | `mauSource`, `mauReferenceMonth` (YYYY-MM) |
| `dau` | `dauSource`, `dauReferenceDate` (YYYY-MM-DD) |
| `revenue` | `revenueStartDate`, `revenueEndDate`, `revenueSource`, `revenueExtractDate` |
| `transactionVolume` | `metricsStartDate`, `metricsEndDate`, `transactionVolumeBasis` (`LAST_12_MONTHS` / `SINCE_LAUNCH`), `transactionVolumeSource`, `transactionVolumeExtractDate` |

3단계는 아무 지표를 입력하지 않거나, 지표 값만 입력하거나, 기본 집계 기준/날짜만 전송해도 저장할 수 있다. `{ "data": {} }`, 선택 필드의 `null`·빈 문자열을 허용하며 공란은 null로 저장한다. 기존 임시저장 값과 병합하므로 요청에서 빠진 값은 유지하고, 저장한 값을 지우려면 해당 필드에 null 또는 빈 문자열을 명시한다. 지표 하나나 보조 필드 하나가 입력돼도 나머지를 필수로 요구하지 않는다. 숫자는 `0` 대신 `"0"`처럼 문자열로 보내야 하며, 입력한 값의 잘못된 형식과 날짜 관계는 계속 거절한다. 실패 시 기존 입력과 저장 시각을 유지한다.

증빙 최소 개수, 회계연도 기준과 거래액 집계 기간의 자동 산출은 추가 확정이 필요한 정책이다. 이번 단계 저장에서는 증빙 최소 1개를 임의로 강제하지 않으며, 최종 제출 시의 완결성 검증으로 간주하면 안 된다. 최소 주문 수량/호가 단위의 기본값도 서버에서 임의로 채우지 않는다.

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

`applicationNumber`, `submittedAt`, `reviewComment`, `revisionDeadline`은 DB에 기록된 값만 반환하고 미기록 값은 null이다. 접수일은 후속 최종 제출 API가 기록하며, 심사 의견·보완 기한은 아래 관리자 심사 API가 변경한다. 현재 사용자 작성 흐름에서는 저장 후 DRAFT를 유지한다. 접수 이후 상태 조회의 자동 검증에는 **로컬 전용 테스트 데이터**를 사용한다.

첨부는 현재 작성 묶음의 저장 완료 자료를 조회한다. 최초 제출 당시 스냅샷은 후속 제출 기능에서 구현한다. 관리자 보완 요청 시 요청 당시 자료를 동결·보존하며, 재제출·승인 시 해당 자료를 동결한다.

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

ERD의 최종 제출 필드는 미입력 임시저장과 양립하도록 이번에는 draftData(JSONB)에 보관한다. 검색/제약에 필요한 소유자·서비스명·URL·상태·단계·저장/만료일은 별도 컬럼이다. 최종 제출 모듈에서 draftData를 필수값/형식 검증하고 ERD의 정형 필드·신청번호·신청 상태로 전환해야 한다.

logoCollectionId / mainImageCollectionId / evidenceCollectionId는 기존 [파일 API](files.md)의 작성 묶음 ID다. FilesService.getSavedCollection으로 소유자와 용도를 확인한다. 파일 ID나 임의 URL을 업로드 완료 자료로 간주하지 않는다. 이어서 작성할 때 파일 API로 해당 묶음의 saved 자료를 조회한다. 본 작업은 최종 제출 시 파일 불변 스냅샷이나 신청서-파일 FK를 구현하지 않는다. 임시저장 삭제/만료 시 파일을 함께 물리 삭제하지 않는다.

## 관리자 상장 신청 조회·서류 다운로드

이슈 #70. 관리자 Bearer 토큰(`Role.ADMIN`)이 필요하다. 신청번호·접수일이 있는 `SUBMITTED`, `UNDER_REVIEW`, `REVISION_REQUESTED`, `APPROVED`, `REJECTED` 신청서를 조회한다. 삭제된 신청서는 제외한다. 최초 접수 API 도입 전에는 로컬 seed의 접수 이후 신청서 또는 통합 검증의 테스트 데이터를 사용한다.

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/api/admin/listing-applications` | 신청 목록, 페이지 정보 및 필터에 맞는 전체 건수 |
| GET | `/api/admin/listing-applications/{id}` | 신청자, 접수 정보, 신청 입력값, 현재 첨부 및 보완 이력 |
| GET | `/api/admin/listing-applications/{id}/attachments/{attachmentId}/content` | 파일 바이너리. 해당 신청서 상세의 `downloadPath` 사용 |

- 신청자 입력칸의 값은 `applicant`로 보낸다. 로그인 아이디 또는 닉네임에 부분 일치한다. 통합 검색용 `keyword`는 신청번호, 서비스명, 로그인 아이디, 닉네임을 검색한다. 두 검색어는 각각 최대 30자이며 대소문자를 구분하지 않는다. 두 쿼리를 함께 보내면 두 조건을 모두 충족하는 신청서를 반환한다.
- 카테고리 목록은 `GET /api/sectors`를 사용한다. 선택한 카테고리의 `sectorCode`를 양의 정수로 보내면 해당 카테고리만 조회한다. 전체 카테고리를 선택하면 `sectorCode`를 생략한다. 신청 상태는 선택값을 `status`로 보낸다.
- 첫 진입 시 프론트에서 최근 30일을 계산해 `from`(포함)과 `to`(미포함)를 보낸다. 시간대를 포함한 ISO 일시를 사용한다. 양 끝 날짜를 포함하려면 시작일 0시부터 종료일 다음 날 0시까지 보낸다. 날짜 필터를 초기화하면 두 쿼리를 모두 생략하고 API는 전체 기간을 조회한다. 한쪽만 보내면 해당 경계만 적용한다.
- `page`는 1~100000(기본 1), `size`는 1~100(기본 20)이다. 접수일 내림차순, 접수일이 같으면 ID 내림차순으로 `items`, `page`, `size`, `totalCount`를 반환한다.

목록 각 항목에 신청 ID, 신청번호, 서비스명, 카테고리 코드·이름(`sectorCode`, `sectorName`), 접수일, 상태 및 한글 상태명, 신청자 ID·로그인 아이디·닉네임을 반환한다. 이전 신청서에 카테고리 코드가 없으면 두 값이 `null`이다. 등록되지 않은 카테고리 코드는 코드만 내려가고 이름은 `null`이다. 상세에는 신청 입력값(`data`), 최근 심사 의견·보완 기한, 저장 완료된 로고·대표 이미지·증빙(`attachments`)과 보완 회차(`revisions`, ID 내림차순)가 추가된다. 재제출 회차의 `evidence`는 당시 스냅샷이다.

파일은 관리자용 `downloadPath`로 토큰을 붙여 내려받고, 링크는 `url`을 표시한다. 다운로드 시 신청서에 연결된 저장 완료 파일 또는 해당 신청서의 재제출 스냅샷에 포함된 파일인지 확인하고, 실제 묶음의 소유자·용도·저장 여부도 확인한다. 다운로드 응답은 파일 형식, 원래 파일명, 캐시 금지 헤더를 제공한다.

| 응답 | 상황 |
|---|---|
| 400 `BAD_REQUEST` | 쿼리나 경로 값 형식 오류 |
| 400 `LISTING_INVALID_SUBMITTED_PERIOD` | 시작이 종료와 같거나 늦음 |
| 401 / 403 | 인증 정보 없음 또는 관리자 권한 없음 |
| 404 `LISTING_APPLICATION_NOT_FOUND` | 신청서가 없거나 심사 대상이 아님 |
| 404 `FILE_NOT_FOUND` | 신청서에 연결되지 않았거나 다운로드 가능한 저장 완료 파일이 아님 |

조회·다운로드는 읽기 전용이다. 최초 접수 건은 명시적인 검토 시작 API에서 `SUBMITTED`에서 `UNDER_REVIEW`로 전환하며, 검토 시작 전 대기 건수는 `SUBMITTED`를 기준으로 집계한다. 보완 자료가 재제출되면 기존 재제출 API에서 `UNDER_REVIEW`로 전환한다. 심사 결과와 관리자 활동 이력은 아래 심사 처리 API에서 같은 트랜잭션으로 기록한다(공통 이력 서비스는 PR #69).

로컬 검증은 `npm run build` 후 `node scripts/verify-admin-listing-applications.mjs`로 실행한다. 일회용 로컬 DB와 임시 파일 저장소에서 권한, 검색·카테고리·기간·페이징, 상세 조회 시 상태 유지, 보완 이력 및 파일 다운로드를 확인한다.

Swagger에서는 관리자 로그인·Authorize → **Admin - Listing Applications**의 목록에서 `id` 확인 → 해당 `id`의 상세 조회 → 파일 항목의 `id`로 다운로드 순서로 검증한다. seed 신청서에 첨부가 없으면 목록·상세를 확인할 수 있으며, 파일이 연결된 예시는 위 통합 검증에서 생성한다.

## 관리자 상장 심사 처리 (MOTU-21-1-2, 이슈 #89)

화면설계서 `[2차 개발]모투화면설계서.pptx`의 **ADM-LST-03** 기준이다. 관리자 Bearer 토큰이 필요하다. 사용자는 심사 API를 호출할 수 없다. 상세 조회나 모달을 여는 행위로 상태를 변경하지 않는다. 프론트는 처리 확인 모달에서 확정했을 때 아래 POST 요청을 보낸다. 취소하면 요청하지 않는다.

| 메서드 | 경로 | 입력·상태 전환 |
|---|---|---|
| POST | `/api/admin/listing-applications/{id}/start-review` | 본문 없음. `SUBMITTED → UNDER_REVIEW` |
| POST | `/api/admin/listing-applications/{id}/revision-requests` | `requestItems`, `requestContent`, `deadline`. `UNDER_REVIEW → REVISION_REQUESTED` |
| POST | `/api/admin/listing-applications/{id}/revision-requests/{revisionId}/extend-deadline` | `deadline`, `reason`. 미재제출 보완 요청의 기한 연장 |
| POST | `/api/admin/listing-applications/{id}/reject` | `reason`. `UNDER_REVIEW → REJECTED` |
| POST | `/api/admin/listing-applications/{id}/approve` | 아래 승인 입력값. `UNDER_REVIEW → APPROVED`, 거래 대기 상품 생성 |

성공은 모두 HTTP 200이다. `data`에 `applicationId`, `applicationNumber`, `status`, `stockId`(승인 후 상품 ID, 그 전 null), `revisionId`(보완 생성·연장에서만 값), `revisionDeadline`을 반환한다. 처리 후 상세·상태 조회를 다시 실행한다. 이미 처리했거나 현재 상태에서 허용하지 않는 요청은 **409**이며 이력을 추가하지 않는다. 통신 오류로 재시도해 409를 받았다면 상세 조회로 실제 결과를 확인한다.

### 보완 요청과 재제출

```json
{
  "requestItems": ["증빙자료", "서비스 지표 근거"],
  "requestContent": "최신 지표를 확인할 수 있는 증빙자료로 보완해 주세요.",
  "deadline": "2026-12-07T23:59:59+09:00"
}
```

- `requestItems`: 공백 제거 후 중복 없는 항목명 1~10개, 항목당 1~100자. `requestContent`: 1~2000자. `deadline`: 시간대 포함 미래 일시. 날짜 예시는 테스트 당일 이후로 바꾼다.
- 요청 회차에 항목·내용·최초 기한·신청 입력값·저장 완료 첨부 스냅샷을 남긴다. 당시 자료는 동결해 이후 삭제·교체로 이력을 잃지 않게 한다. 로고·대표 이미지는 사용자에게 공개되는 상품 이미지로 승인 시 연결하며, 증빙자료는 공개하지 않는다.
- 기존 사용자 API `GET /api/listing-applications/{id}/revision-requests`에서 항목·내용·현재 기한·기한 변경 이력(`deadlineHistory`)을 읽는다.
- 사용자는 **새 EVIDENCE 묶음**에 파일·링크 합산 1~10개와 설명 10~500자를 저장하고 `POST /api/listing-applications/{id}/revision-requests/{revisionId}/resubmit`에 `{"evidenceCollectionId":"작성 묶음 UUID"}`를 보낸다. 기존 신청번호·접수일을 유지하고 `UNDER_REVIEW`로 복귀한다. 이 API의 동일 요청 재전송은 기존 성공 결과를 반환한다.
- 기한이 지나면 재제출은 410이고 `REVISION_REQUESTED`를 유지한다. 관리자는 해당 미재제출 회차에 현재 시각과 기존 기한보다 늦은 `deadline`, `reason`(1~200자)을 보내 연장한다. 최초 기한·이전 기한·관리자·시각·사유를 보존한다. 재제출 완료 회차는 연장할 수 없다.
- 추가 보완은 검토 중 상태에서 새 요청을 생성해 별도 회차로 남긴다. 관리자 상세의 `revisions[].previousEvidence`는 요청 당시 자료이고 `evidence`는 재제출 자료다. 양쪽 파일 모두 해당 항목의 관리자 `downloadPath`로 내려받는다.

### 반려

```json
{ "reason": "제출 자료로 서비스 운영 사실을 확인하기 어렵습니다." }
```

사유는 공백 제거 후 1~200자다. 반려 사유·신청번호·기존 증빙과 보완 이력은 유지하고 상품을 만들지 않는다. 사용자는 새 신청서를 작성할 수 있다. 신규 신청번호 발급은 후속 최종 제출 기능에서 처리한다.

### 승인 입력값과 상품 생성 규칙

```json
{
  "finalPrice": "10000",
  "totalIssuedQuantity": "100000",
  "listingDate": "2026-12-01",
  "tradingStartAt": "2026-12-01T09:00:00+09:00",
  "reason": "기본정보와 증빙자료 검토 완료",
  "priceAdjustmentReason": "수익 지표를 반영해 희망 상장가 조정"
}
```

| 승인 화면 입력 | API 필드 | 검증·저장 |
|---|---|---|
| 최종 상장가 | `finalPrice` | 양의 정수 문자열. 상품 `basePrice` |
| 총 발행량 | `totalIssuedQuantity` | 양의 정수 문자열. 상품 `listedShares` |
| 상장일 | `listingDate` | KST 달력 날짜 `YYYY-MM-DD`, 오늘 이후. 상품 `approvedListingDate`(DATE) |
| 거래 시작일시 | `tradingStartAt` | 시간대 포함 미래 ISO 일시. KST 기준 상장일 이전 불가. 상품의 기존 `listingDate`(TIMESTAMPTZ) |
| 처리 사유 | `reason` | 공백 제거 후 1~200자. 최근 심사 의견·승인 스냅샷·활동 이력 |
| 가격 조정 사유 | `priceAdjustmentReason` | 희망가와 최종가가 다르면 필수, 공백 제거 후 1~200자 |

- 기존 사용자·관리자 상품 API의 `listingDate`는 **거래 시작일시**라는 기존 의미를 유지한다. 별도의 확정 상장일은 `approvedListingDate`에 저장하고 관리자 상품 상세에도 제공한다. 신청서 상세·상태의 `approval.listingDate`, `approval.tradingStartAt`으로 승인 당시 두 값을 구분해서 읽을 수 있다.
- 기존 주문·상품 API의 숫자 표현에 맞춰 가격·수량은 각각 `Number.MAX_SAFE_INTEGER` 이하, 가격×총 발행량은 PostgreSQL BIGINT 범위 이하다. 최종가는 호가 단위의 배수이며 발행량은 최소 주문 수량 이상이어야 한다.
- 호가 단위와 최소 주문 수량은 기존 신청 입력값(`tickSize`, `minOrderQuantity`)을 사용한다. 기존 정책대로 선택 입력이므로 없으면 각각 `1`을 사용한다. 최소 주문 가격은 호가 단위다.
- 상품명·소개·카테고리·운영사·공식 URL·서비스 지표는 신청 입력값을 복사한다. 지표는 기존 정책대로 선택이며 비어 있으면 null이다. 신청 기본정보·필수 대표 이미지·저장 완료 증빙·설명과 신청자 거래 계좌를 검증한 뒤 승인한다. 지나간 희망 거래일 대신 관리자가 확정한 거래 시작일시를 검증한다.
- 상품 코드는 `LST-{신청서 ID}`로 생성한다. 승인 시 기존 신청번호는 바꾸지 않는다. 원래 희망 입력값은 `data`에 유지하고 확정값은 `approval`에 별도 보존한다. 신청서와 상품은 고유한 `stockId`로 일대일 연결된다.
- 승인 즉시 `PENDING` 상품을 생성하고 공개한다. 이미지 묶음은 동결하고 공개 상품의 로고·대표 이미지 전용 경로(`/api/stocks/listing-images/{신청서 ID}/main`, `/logo`)를 저장한다. 증빙자료·비공개/삭제 상품 이미지는 이 경로로 제공하지 않는다.
- 서버 시작 시와 **5초마다** 승인 상품의 거래 시작 예약을 확인한다. 지정 시각 이후 기존 `StockTradingService.openListing`을 호출해 신청자에게 발행 주식 전량을 부여하고 상장가 전량 매도 주문을 만든 뒤 `ACTIVE`로 전환한다. 승인 시점에는 보유·주문을 만들지 않는다. 서버 중단 중 지난 예약도 재시작 시 처리한다. DB 오류 등으로 실패하면 다음 주기에 재시도하며 상품은 거래 대기로 남는다. 새 환경 변수나 Railway Cron 설정은 필요하지 않다.

### 활동 이력·중복 처리

신청 행을 `FOR UPDATE`로 잠가 사용자 재제출과 관리자 처리를 직렬화한다. 승인 시 상품 생성·신청 상태·승인 스냅샷·첨부 동결·활동 이력을 같은 트랜잭션으로 저장한다. 어느 하나 실패하면 모두 롤백한다. 동시 승인에는 하나만 성공하고 나머지는 409다. 거래 시작도 상품 행 잠금으로 발행 주식·최초 주문을 중복 생성하지 않는다.

`targetType=LISTING_APPLICATION&targetId={신청서 ID}`로 공통 활동 이력을 조회한다. 수행 작업은 `LISTING_REVIEW_START`(검토 시작), `LISTING_REVISION_REQUEST`(보완 요청), `LISTING_REVISION_DEADLINE_UPDATE`(보완 기한 연장), `LISTING_REJECT`(반려), `LISTING_APPROVE`(승인)이다. 활동 이력 화면의 상장 신청 수행 작업 선택지에 새 작업 두 개를 추가해 연결한다.

| 응답 | 의미 |
|---|---|
| 400 `BAD_REQUEST` | 필드 누락·형식·길이 오류 |
| 400 `LISTING_REVIEW_INVALID_APPROVAL` | 가격·발행량·상장일·거래 시작일·가격 조정 사유 오류 |
| 400 `LISTING_REVIEW_INVALID_DEADLINE` | 과거 기한 또는 연장 기한이 기존 기한 이하 |
| 400 `LISTING_REVIEW_INCOMPLETE_APPLICATION` | 상품 생성에 필요한 신청 정보·첨부 불충족 |
| 409 `LISTING_REVIEW_INVALID_STATE` | 중복 처리·최종 상태 덮어쓰기·다른 회차 연장 등 |
| 409 `LISTING_REVIEW_ISSUER_ACCOUNT_REQUIRED` | 신청자의 거래 계좌 없음 |

마이그레이션 `20261118090000_add_listing_review`는 기존 데이터 삭제 없이 승인 정보·상품 연결·확정 상장일·보완 항목과 활동 이력 작업을 추가한다. 로컬 DB에 `npm run db:deploy` → `npm run db:generate` → `npm run start:dev` 순서로 적용한다. 운영 적용은 dev 병합 후 팀의 기존 배포 절차를 따른다.

`npm run build` 후 **`node scripts/verify-admin-listing-review.mjs`**로 전체 흐름을 자동 검증한다. localhost PostgreSQL에 별도의 일회용 DB를 만들고 모든 마이그레이션을 적용한다. 실제 파일 업로드·권한·기한 경과/연장·반복 보완·재제출·반려·동시 승인·활동 이력 롤백·상품 이미지·예약 거래 시작·동시 발행을 확인하고 DB와 파일을 정리한다. 기존 DB나 운영 데이터는 변경하지 않는다.

수동 Swagger 테스트용 접수 신청서는 아래 스크립트로 준비한다. 먼저 `motuuser`로 파일 API에서 MAIN_IMAGE(저장된 이미지 1개)와 EVIDENCE(저장된 파일·링크 1~10개, 설명 10~500자) 묶음을 준비한다. 두 UUID는 파일 ID가 아닌 작성 묶음 ID다.

```powershell
node scripts/prepare-admin-listing-review-demo.mjs --main-image "대표이미지-묶음-UUID" --evidence "증빙-묶음-UUID"
```

localhost 비운영 DB만 허용하며 본인 묶음의 용도·저장 상태·이미지·설명과 거래 계좌를 검사한 뒤 A(승인), B(보완), C(반려) 접수 신청서를 생성한다. 출력된 `applications.*.applicationId`를 사용한다. 보완 요청·기한 연장 본문은 출력의 `revisionBody`, `extensionBody` 안쪽 객체를 복사한다. 재실행하면 새 신청서 3개를 추가하며 기존 신청서는 수정하지 않는다. 다른 로컬 계정은 `--login-id`로 지정한다. 관리자 처리·사용자 재제출은 Swagger에서 직접 진행한다.

최초 최종 제출(`DRAFT → SUBMITTED`)·정식 신청번호 발급·SMS 2차 보안 연동은 이번 관리자 심사 범위에 포함되지 않는다. 기존 접수 신청서 또는 검증 스크립트의 테스트 신청서에서 시작한다.

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
