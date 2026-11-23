# 상장 신청 저장·최종 제출·조회·관리자 심사

## 탈퇴 회원의 승인·발행 차단 (#88 연계)

- 승인과 실제 거래 시작은 신청자의 `accounts.account_id` 행에 `FOR UPDATE` 잠금을 얻고, **잠금 이후 별도 SQL에서 회원 상태를 다시 조회**한다. #88의 `SettlementService.lockAccounts`와 동일한 행 잠금을 사용한다. 승인에서는 신청서 → 계좌, 거래 시작에서는 상품 → 계좌 순서이며 잠금을 잡은 채 외부 작업을 기다리지 않는다.
- `WITHDRAWN`이면 승인은 **409 `LISTING_ISSUER_WITHDRAWN`**. 상품·승인 상태·첨부 동결·승인 활동 이력을 저장하지 않는다. 로그인 잠금(`LOCKED`)·정지(`BLOCKED`)까지 탈퇴로 간주하지 않는다.
- 거래 시작 직전 탈퇴가 확인되면 발행 주식·최초 매도 주문·호가 등록·ACTIVE 전환을 실행하지 않는다. 상품은 **PENDING 유지**하고 `listingBlockedAt`, `listingBlockedReason="신청자 탈퇴로 발행 보류"`를 저장한다. 보류 기록은 커밋한 뒤 같은 오류를 반환하므로 실패 예외로 보류 기록이 롤백되지 않는다.
- 예약 처리에서는 `listingBlockedAt=null`인 상품만 처리한다. 다른 서버나 직접 호출도 기존 보류를 유지하며 보류 시각을 덮어쓰지 않는다. 자동 재시도·자동 해제는 없다. 관리자 신청 상세 응답의 `listingBlockedAt`, `listingBlockedReason`으로 확인한다. 승인 이력은 APPROVED로 보존한다.
- 발행 보류 상품은 사용자 화면에 거래 대기로 남으므로, 관리자가 [ADM-PRD-05 상품 종료](stocks.md#거래-중지재개-adm-prd-04-상품-종료-adm-prd-05)에서 종료 사유·안내문을 입력하고 `POST /api/admin/stocks/{stockId}/close`로 정리한다(`PENDING → CLOSED`). 거래 종료는 되돌릴 수 없다.
- 조회·발행 실패 로그에는 오류 원인과 stack을 남긴다. 탈퇴 보류는 일반 일시 오류와 구분한다.
- 신규 마이그레이션: `20261119060000_add_listing_activation_hold`. 기존 상품 데이터는 보존하고 보류 필드를 null로 추가한다. `npm run db:deploy` 후 `npm run db:generate`를 적용한다.

### #88 담당자와 맞출 탈퇴 계약

탈퇴 처리도 동일 계좌 행을 잠근 **후**, 본인 신청서의 `APPROVED`와 연결 상품의 `PENDING`·미삭제 여부를 확인하고 있으면 **409**로 차단해야 한다. 이 거부로 주문 취소·포인트 소멸·회원 상태·토큰 폐기도 모두 롤백해야 한다. 접수·검토 중·보완 요청만으로는 탈퇴를 차단하지 않는다. 이 계약을 지켜야 승인이 먼저 완료된 경우 탈퇴가 차단되고, 탈퇴가 먼저 완료된 경우 승인이 차단된다.

본 변경은 #90 범위이며 #88의 탈퇴 API는 수정하지 않는다. #88의 `WITHDRAWN` 상태값을 텍스트로 판정하므로 해당 enum이 없는 기존 dev에서도 실행 가능하다. 상태값·스키마 반영 후 두 PR의 실제 탈퇴 API까지 통합 검증해야 한다.

`node scripts/verify-admin-listing-review.mjs`는 일회용 로컬 DB에만 #88의 WITHDRAWN enum을 준비한다. 실제 승인 HTTP API와 거래 시작 서비스에 대해 계좌 잠금 대기·탈퇴 선행·승인 선행·보류 저장·관리자 조회·재시도 제외를 검증한다. 탈퇴 쪽은 같은 DB 잠금·PENDING 검사 계약을 재현하며 **#88 탈퇴 엔드포인트 자체를 검증한 것은 아니다**.

본인 보완 요청 조회·기한 검사와 증빙 재제출은 [보완 요청·재제출](listing-revisions.md)을 참고한다. 재제출 시 기존 신청번호를 유지하고 검토 중으로 전환하며, 제출한 증빙 묶음은 변경을 차단한다.

운영자의 심사 대상 조회는 [관리자 상장 신청 조회·서류 다운로드](#관리자-상장-신청-조회서류-다운로드)를 참고한다.

관련 이슈: #33. MOTU-30-02-01, MOTU-32-02-01~03.

단계별 저장·조회 추가: [#36](https://github.com/MARS-crew/motu-backend/issues/36). MOTU-36-02-01, MOTU-38-01-01~02. 관리자 심사는 #89, 최초 최종 제출·신청번호 발급·DRAFT → SUBMITTED 전환·공통 2차 보안 연계는 [#108](https://github.com/MARS-crew/motu-backend/issues/108)(MOTU-36-02-02~04)에서 추가했다.

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

단계 저장은 증빙 없이도 작성 중 내용을 보관할 수 있다. **최초 최종 제출에서는 승인·보완 재제출과 동일하게 본인의 EVIDENCE 묶음에 저장 완료된 파일·링크 합산 1~10개가 필수**다. 신청서의 자료 설명과 증빙 묶음에 저장한 설명도 각각 10~500자를 검사한다. 업로드/링크 등록만 하고 묶음에 선택 저장하지 않은 자료는 개수에 포함하지 않는다. 회계연도 기준과 거래액 집계 기간의 자동 산출은 추가 확정이 필요한 정책이며, 최소 주문 수량/호가 단위의 기본값은 서버에서 임의로 채우지 않는다.

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

`applicationNumber`, `submittedAt`, `reviewComment`, `revisionDeadline`은 DB에 기록된 값만 반환하고 미기록 값은 null이다. 작성·단계 저장은 DRAFT를 유지하고, 아래 최종 제출 API가 최초 접수일과 번호를 기록한다. 심사 의견·보완 기한은 관리자 심사 API가 변경한다. 최종 제출부터 관리자 보완·사용자 재제출까지 일회용 로컬 DB에서 자동 검증한다.

최초 제출은 기존 신청서의 입력값을 보존하고 로고·대표 이미지·증빙의 저장 완료 묶음을 동결한다. 이후 작성 API로 신청서나 동결 묶음을 변경할 수 없으며, 자료 조회·다운로드는 유지한다. 관리자 보완 요청은 이전 입력·첨부 스냅샷을 보존하고, 재제출은 새 증빙 묶음으로 교체·동결하므로 과거 자료도 남는다.

## 최초 최종 제출 (USR-LST-06·07)

1차 화면설계서 USR-LST-06·07의 최종 확인·접수 완료와 2차 설계서 USR-AUTH-09·USR-MY-04의 공통 2차 보안을 연결한다. 관리자 보완 생성 API를 새로 만들지 않고 기존 심사 API를 재사용한다.

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/api/listing-applications/{id}/submit` | 본인의 유효한 임시저장을 검증·최초 접수 |

```json
{
  "expectedLastSavedAt": "2026-11-22T10:00:00.123Z"
}
```

`expectedLastSavedAt`은 최종 확인 화면에서 표시한 신청서의 저장 시각이다. 임시저장/단계 저장 또는 임시저장 상세 응답의 `lastSavedAt`을 그대로 사용한다. 화면의 미저장 변경은 먼저 저장하고 응답 시각으로 갱신한다. 본문에 신청 입력값, 회원 ID, 신청번호, 상태 또는 SMS 인증번호를 보내지 않는다. 다른 탭의 저장으로 시각이 바뀌었으면 409를 받고 최신 내용을 확인한다.

### 2차 보안과 프론트 흐름

1. 작성·단계 저장에는 2차 보안이 필요 없다. 최종 확인 후 submit을 호출한다.
2. **409 `TWO_FACTOR_NOT_ENABLED`**: 기존 설정 화면에서 `POST /api/two-factor/phone-verifications`와 `/phone-verifications/confirm`으로 등록한다. 설정 완료 인증도 최근 인증으로 인정한다.
3. **403 `TWO_FACTOR_REQUIRED`**, `details.action=LISTING_SUBMIT`: `POST /api/two-factor/verifications` → `/verifications/confirm`으로 등록 휴대폰을 재인증한다. 성공 응답의 `verifiedUntil`까지 공통 10분 인증을 재사용한다.
4. 인증 성공 후 같은 신청서와 저장 시각으로 submit을 다시 호출한다. 인증 실패·취소·만료는 접수하지 않는다. SMS 5회 실패 잠금·재발송 간격은 기존 공통 정책을 따른다. 제출 API가 별도 SMS를 발송하거나 인증번호를 소비하지 않는다.
5. 성공 후 접수 완료를 표시하고 본인 상세·상태 조회를 연결한다. 서버는 회원 잠금 획득 후 활성 상태와 인증을 다시 읽고, 첨부·번호 잠금 대기 후에도 인증·임시저장 만료와 희망 일시를 다시 검사한다.

### 검증·접수 결과

- **네 단계 전체**의 필수값·형식·등록 카테고리를 재검증한다. 3단계 지표와 보조 입력은 각각 선택 입력이며 모두 생략 가능하다. 입력한 값의 오류는 차단한다.
- 대표 이미지는 본인의 MAIN_IMAGE 묶음에 저장 완료된 이미지 1개가 필수다. 로고는 선택이며 제공 시 LOGO 이미지 1개를 검사한다. 증빙은 본인의 EVIDENCE 묶음에 저장 완료된 파일·링크 합산 1~10개가 필수이며, 신청서의 자료 설명과 묶음에 저장한 설명이 각각 10~500자여야 한다. 업로드/링크 등록만 하고 묶음을 저장하지 않았다면 제출 자료로 인정하지 않는다. 누락 시 400 `LISTING_SUBMISSION_VALIDATION_FAILED`의 `details.fields`에 4단계 필드와 보완 방법을 안내하고 DRAFT를 유지한다.
- 신청서를 새 행으로 복사하지 않는다. 같은 ID에 `applicationNumber`, 최초 `submittedAt`, `status=SUBMITTED`를 한 트랜잭션으로 기록한다. 입력·저장 시각은 보존하고 첨부 동결도 함께 커밋한다. 실패하면 번호·상태·첨부 동결을 모두 롤백하며 임시저장을 유지한다.
- 신청번호는 **`LST-YYMMDD-NNN`**, 한국 날짜(Asia/Seoul)별 `001`부터 `999`까지다. 일별 advisory lock으로 여러 서버의 발급을 직렬화하며, 삭제된 신청서까지 포함한 기존 정식 번호 최댓값 다음 번호를 쓴다. `prisma/seed.ts`의 새 접수 이후 신청서도 같은 발급기로 당시 한국 접수 날짜의 정식 번호를 생성한다. 이미 저장된 과거 seed 번호는 재실행으로 바꾸지 않는다. 하루 999건을 넘으면 번호를 늘려 쓰지 않고 409로 거부한다.
- **동일 신청서 중복 제출은 HTTP 200**이다. 이미 최초 접수된 신청서는 새 번호·접수일을 만들지 않고 최초 값을 유지하며 **현재 상태**와 `replayed=true`를 반환한다. 통신 재시도에 재인증을 추가 요구하지 않지만 현재 활성 회원·본인 신청서 여부는 검사한다. 보완 자료 제출은 기존 resubmit API를 사용한다.
- 접수 이후에는 90일 임시저장 만료를 적용하지 않는다. 자동 저장·삭제는 차단하고 관리자 명시적 검토 시작 전까지 `SUBMITTED`를 유지한다. 승인·주식 발행·최초 매도 주문은 이 API에서 수행하지 않는다.

```json
{
  "success": true,
  "data": {
    "applicationId": 154,
    "applicationNumber": "LST-261122-001",
    "status": "SUBMITTED",
    "submittedAt": "2026-11-22T10:01:00.000Z",
    "replayed": false
  }
}
```

| HTTP | 오류 코드 | 처리 |
|---|---|---|
| 400 | `BAD_REQUEST` | 본문·ID 형식 확인 |
| 400 | `LISTING_SUBMISSION_VALIDATION_FAILED` | `error.details.fields[]`의 단계·필드·메시지를 표시하고 수정·저장 |
| 409 | `LISTING_SUBMISSION_CONFLICT` | 최신 임시저장 재조회 후 내용을 확인하고 다시 제출 |
| 409 | `LISTING_SUBMISSION_INVALID_STATUS` | 번호·최초 접수일이 없는 잘못된 상태 또는 모순된 초안. 상태 조회 후 확인 |
| 409 | `LISTING_SUBMISSION_NUMBER_LIMIT` | 한국 날짜 기준 다음 날 재시도 |
| 410 | `LISTING_DRAFT_EXPIRED` | 만료된 임시저장을 제출할 수 없음 |
| 404 | `LISTING_APPLICATION_NOT_FOUND` | 본인 신청서가 없거나 삭제됨 |
| 401/403 | 인증·회원 상태 오류 | 로그인·계정 상태 확인. 2차 보안 오류는 위 공통 흐름 적용 |

### 로컬 검증·운영 적용

기존 컬럼과 공통 2차 보안 서비스를 사용하므로 이번 제출 기능의 신규 마이그레이션·환경 변수는 없다. 미적용된 dev 마이그레이션이 있으면 로컬에서 `npm run db:deploy` → `npm run db:generate` → `npm run start:dev` 순으로 준비한다. 테스트를 위해 운영 인증 설정을 변경하지 않는다. 실제 SMS는 기존 Brevo/SMS 발송 설정과 크레딧이 필요하며, 발송기 미설정 상태의 로컬 로그 확인은 실제 문자 수신 검증과 구분한다.

`npm run build` 후 `node scripts/verify-listing-submission.mjs`를 실행하면 localhost에 별도의 일회용 DB와 파일 저장소를 만들고 모든 마이그레이션을 적용한다. 실제 HTTP로 공통 2차 보안 설정·재인증, 선택 지표, 필수값·첨부 검증, 최초 접수·재시도, 서버 두 개의 동시 제출, 번호 한도, 저장/계정 정지 경합, 실패 롤백, 관리자 보완·사용자 재제출을 검사한다. SMS·메일은 가짜 발송기를 사용하고 종료 시 생성한 DB와 파일을 삭제한다. 기존 DB·운영 데이터와 실제 문자 발송은 변경하지 않는다.

### Swagger 확인 순서

1. 서버를 재시작하고 로그인·Authorize한다.
2. 기존 `POST /api/listing-applications/drafts`에 `{}`를 보내 신청서 `id`를 얻는다.
3. `GET /api/sectors`로 실제 카테고리 코드를 확인한다. 파일 API에서 MAIN_IMAGE 묶음 생성 → 이미지 업로드 → `PUT /api/files/collections/:id`에 업로드한 attachmentIds를 보내 저장한다.
4. EVIDENCE 묶음도 새로 생성해 파일 업로드 또는 HTTPS 링크 등록 후 `PUT /api/files/collections/:id`에 `attachmentIds`(1~10개), `description`(10~500자), `validateStep:true`로 저장한다. `Listing applications - Drafts`의 PUT `.../:id/steps/:step`에서 step=1로 기본정보를 저장한다. step=2는 가격·수량·산정 근거, step=3은 선택 지표(모두 비우려면 `{"data":{}}`), step=4는 `evidenceDescription`과 저장한 묶음 ID인 `evidenceCollectionId`를 전달한다. 예전에 증빙 설명만 넣은 테스트 신청서는 묶음을 추가 저장한 뒤 최신 `lastSavedAt`으로 제출한다.
5. `Listing applications - Queries`에서 GET `/:id`로 네 단계 입력과 저장 완료 첨부를 확인한다. GET `/:id/status`는 DRAFT, `isEditable=true`, `applicationNumber=null`, `submittedAt=null`이어야 한다.
6. 단계 필수값 누락/잘못된 날짜는 400이며 이전 저장값이 유지되는지 확인한다. 다른 사용자 토큰으로 같은 ID를 조회하면 404다. 미완성 내용을 보관하려면 기존 PATCH 임시저장을 계속 사용한다.
7. 최종 확인할 임시저장의 `lastSavedAt`을 복사한다. `Listing applications - Submission`의 `POST /:id/submit`에 같은 ID와 `{"expectedLastSavedAt":"복사한 시각"}`을 보낸다. 2차 보안 오류가 나오면 위 설정·공통 재인증 API를 완료한 뒤 다시 보낸다.
8. HTTP 200, `status=SUBMITTED`, 정식 신청번호·최초 접수일과 `replayed=false`를 확인한다. 같은 본문으로 한 번 더 실행하면 같은 번호·시각과 `replayed=true`여야 한다.
9. 본인 상태 조회의 `isEditable=false`, 임시저장 목록에서 제외, 접수 후 PATCH/DELETE 차단을 확인한다. 관리자 토큰으로 상세를 조회해 신청 내용·저장 완료 첨부를 확인하고 기존 검토 시작·보완 요청 API로 이어간다.

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

같은 회원의 생성·수정·삭제·최종 제출은 users 행의 `FOR NO KEY UPDATE` 잠금으로 직렬화한다. 여러 서버나 동시 요청에서도 5건 초과와 제출/저장 덮어쓰기를 막고, 회원 FK 확인의 `FOR KEY SHARE`와는 충돌하지 않아 refresh_tokens·trusted_devices INSERT를 불필요하게 기다리게 하지 않는다. 기존 신청서는 5건인 상태에서도 수정할 수 있다. 삭제·만료되면 빈자리를 사용할 수 있다. 신청서·첨부 등 다른 행 잠금은 각각 기존 정책을 유지한다.

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

PostgreSQL 부분 UNIQUE 인덱스 `listing_applications_active_url_key`가 동시 중복 등록을 최종 차단한다. 만료된 타인 신청서의 URL도 새 요청에서 즉시 해제한다. 중복 시 생성·수정을 롤백하며 기존 신청 내용은 유지한다. 제출·심사도 같은 신청서의 status·normalizedOfficialUrl을 사용하므로 진행 중 URL 제약이 유지된다.

## ERD·파일 기능·후속 작업

신청 입력은 미입력 임시저장과 양립하도록 draftData(JSONB)에 보관한다. 검색/제약에 필요한 소유자·서비스명·URL·상태·단계·저장/만료일·신청번호·접수일은 별도 컬럼이다. 최종 제출은 draftData를 전체 검증·보존하며 기존 신청서를 접수 상태로 전환한다. 관리자 확정 승인값은 approvalData에 별도로 저장한다.

logoCollectionId / mainImageCollectionId / evidenceCollectionId는 기존 [파일 API](files.md)의 작성 묶음 ID다. FilesService.getSavedCollection으로 소유자와 용도를 확인한다. 파일 ID나 임의 URL을 업로드 완료 자료로 간주하지 않는다. 이어서 작성할 때 파일 API로 해당 묶음의 saved 자료를 조회한다. 최초 제출은 묶음을 동결해 당시 자료를 보존한다. 신청서-파일 FK는 별도로 추가하지 않으며 임시저장 삭제/만료 시 파일을 함께 물리 삭제하지 않는다.

## 관리자 상장 신청 조회·서류 다운로드

이슈 #70. 관리자 Bearer 토큰(`Role.ADMIN`)이 필요하다. 신청번호·접수일이 있는 `SUBMITTED`, `UNDER_REVIEW`, `REVISION_REQUESTED`, `APPROVED`, `REJECTED` 신청서를 조회한다. 삭제된 신청서는 제외한다. 최초 최종 제출 API로 접수한 신청서도 바로 조회할 수 있다.

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

사유는 공백 제거 후 1~200자다. 반려 사유·신청번호·기존 증빙과 보완 이력은 유지하고 상품을 만들지 않는다. 사용자는 새 신청서를 작성할 수 있다. 신규 신청번호는 새 신청서의 최초 최종 제출 시 발급한다.

### 승인 입력값과 상품 생성 규칙

```json
{
  "finalPrice": "10000",
  "totalIssuedQuantity": "100000",
  "listingDate": "2026-12-01",
  "tradingStartAt": "2026-12-01T09:00:00+09:00",
  "reason": "기본정보·증빙자료 검토 및 수익 지표를 반영한 상장가 확정"
}
```

| 승인 화면 입력 | API 필드 | 검증·저장 |
|---|---|---|
| 최종 상장가 | `finalPrice` | 양의 정수 문자열. 상품 `basePrice` |
| 총 발행량 | `totalIssuedQuantity` | 양의 정수 문자열. 상품 `listedShares` |
| 상장일 | `listingDate` | KST 달력 날짜 `YYYY-MM-DD`, 오늘 이후. 상품 `approvedListingDate`(DATE) |
| 거래 시작일시 | `tradingStartAt` | 시간대 포함 미래 ISO 일시. KST 기준 상장일 이전 불가. 상품의 기존 `listingDate`(TIMESTAMPTZ) |
| 처리 사유 / 상장가 조정 사유 | `reason` | 입력란 하나. 공백 제거 후 1~200자. 희망가 변경 시 이 사유를 조정 사유에도 보존 |
| 기존 호환용 조정 사유 | `priceAdjustmentReason` | 선택·deprecated. 기존 클라이언트의 1~200자 별도 사유는 보존하지만 새 화면은 보내지 않아도 됨 |

- 기존 사용자·관리자 상품 API의 `listingDate`는 **거래 시작일시**라는 기존 의미를 유지한다. 별도의 확정 상장일은 `approvedListingDate`에 저장하고 관리자 상품 상세에도 제공한다. 신청서 상세·상태의 `approval.listingDate`, `approval.tradingStartAt`으로 승인 당시 두 값을 구분해서 읽을 수 있다.
- 기존 주문·상품 API의 숫자 표현에 맞춰 가격·수량은 각각 `Number.MAX_SAFE_INTEGER` 이하, 가격×총 발행량은 PostgreSQL BIGINT 범위 이하다. 최종가는 호가 단위의 배수이며 발행량은 최소 주문 수량 이상이어야 한다.
- 호가 단위와 최소 주문 수량은 기존 신청 입력값(`tickSize`, `minOrderQuantity`)을 사용한다. 기존 정책대로 선택 입력이므로 없으면 각각 `1`을 사용한다. 최소 주문 가격은 호가 단위다.
- 상품명·소개·카테고리·운영사·공식 URL·서비스 지표는 신청 입력값을 복사한다. 지표는 기존 정책대로 선택이며 비어 있으면 null이다. 신청 기본정보·필수 대표 이미지·저장 완료 증빙·설명과 신청자 거래 계좌를 검증한 뒤 승인한다. 지나간 희망 거래일 대신 관리자가 확정한 거래 시작일시를 검증한다.
- 상품 코드는 기존 seed와 같은 `MOTU0001` 형식으로 생성한다. 숫자는 최소 4자리이며 9999 이후에는 자릿수가 늘어난다. 같은 트랜잭션의 advisory lock으로 생성 요청을 직렬화하고 soft-delete를 포함한 기존 MOTU 숫자 코드의 최댓값 다음 번호를 사용해 seed 이후 생성·여러 신청 동시 승인도 중복을 피한다. 과거 저장된 코드는 덮어쓰지 않는다. 화면 표시 ID인 `PRD-018`과 `stockCode`는 별개다. 승인 시 기존 신청번호는 바꾸지 않는다. 원래 희망 입력값은 `data`에 유지하고 확정값은 `approval`에 별도 보존한다. 신청서와 상품은 고유한 `stockId`로 일대일 연결된다.
- 승인 즉시 `PENDING` 상품을 생성하고 공개한다. 이미지 묶음은 동결하고 공개 상품의 로고·대표 이미지 전용 경로(`/api/stocks/listing-images/{신청서 ID}/main`, `/logo`)를 저장한다. 증빙자료·비공개/삭제 상품 이미지는 이 경로로 제공하지 않는다.
- 서버 시작 시와 **5초마다** 승인 상품의 거래 시작 예약을 확인한다. 지정 시각 이후 기존 `StockTradingService.openListing`을 호출해 신청자에게 발행 주식 전량을 부여하고 상장가 전량 매도 주문을 만든 뒤 `ACTIVE`로 전환한다. 승인 시점에는 보유·주문을 만들지 않는다. 서버 중단 중 지난 예약도 재시작 시 처리한다. DB 오류 등으로 실패하면 다음 주기에 재시도하며 상품은 거래 대기로 남는다. 새 환경 변수나 Railway Cron 설정은 필요하지 않다.

### 활동 이력·중복 처리

활동 이력 `summary`는 기존 한글 상태명 맵을 공유한다. 예: `접수 → 검토 중`, `검토 중 → 승인`, `검토 중 → 보완 요청`. before/after의 상태 코드는 API 호환성을 위해 enum 그대로 보존한다. 상품 상태 잠금은 `FOR NO KEY UPDATE`로 시작·중지·종료를 직렬화하면서 FK의 `FOR KEY SHARE` 및 다른 경로의 INSERT를 불필요하게 막지 않는다. 탈퇴 경합을 제어하는 신청자 계좌 `FOR UPDATE` 잠금은 유지한다.

신청 행을 `FOR UPDATE`로 잠가 사용자 재제출과 관리자 처리를 직렬화한다. 승인 시 상품 생성·신청 상태·승인 스냅샷·첨부 동결·활동 이력을 같은 트랜잭션으로 저장한다. 어느 하나 실패하면 모두 롤백한다. 동시 승인에는 하나만 성공하고 나머지는 409다. 거래 시작도 상품 행 잠금으로 발행 주식·최초 주문을 중복 생성하지 않는다.

`targetType=LISTING_APPLICATION&targetId={신청서 ID}`로 공통 활동 이력을 조회한다. 수행 작업은 `LISTING_REVIEW_START`(검토 시작), `LISTING_REVISION_REQUEST`(보완 요청), `LISTING_REVISION_DEADLINE_UPDATE`(보완 기한 연장), `LISTING_REJECT`(반려), `LISTING_APPROVE`(승인)이다. 활동 이력 화면의 상장 신청 수행 작업 선택지에 새 작업 두 개를 추가해 연결한다.

### 프론트 화면 연결 (ADM-LST-02·03)

- 상세 GET은 읽기 전용이다. 접수 상태에서 **[심사 결과 처리] 클릭** 시 `start-review` 성공 후 처리 화면으로 이동한다. 이미 UNDER_REVIEW이면 호출하지 않는다. 경합 409 시 최신 상태를 재조회하며 다른 상태를 임의로 검토 중으로 바꾸지 않는다. 화면을 취소해도 이미 시작한 검토는 유지한다.
- 승인 화면에는 **처리 사유 / 상장가 조정 사유 입력란 하나**를 두고 `reason`만 보낸다. 가격 변경 시 서버가 `approval.priceAdjustmentReason`에도 같은 사유를 저장한다. 기존 별도 필드는 호환용 선택값이다.
- 보완 요청 선택 시 `requestItems`, `requestContent`와 **보완 기한(필수)** 입력을 표시한다. KST 입력을 시간대 포함 ISO로 보내며 서버 기본 기한은 없다. 과거 기한·잘못된 시간대는 차단한다.
- 신청 상세에서 **REVISION_REQUESTED이며 최근 회차가 아직 재제출되지 않은 경우에만 [보완 기한 연장]**을 제공한다. 현재 기한과 새 기한(필수)·연장 사유(필수 1~200자)를 표시하고 확인 시 extend-deadline을 호출한다. 취소는 API를 호출하지 않는다. 만료 기한도 연장 가능하며 성공 후 상세를 새로 조회한다.
- 관리자 활동 이력의 상장 신청 수행 작업에 검토 시작(LISTING_REVIEW_START), 보완 기한 연장(LISTING_REVISION_DEADLINE_UPDATE)을 연결한다. 보완 기한·연장 진입점은 기존 정책을 유지하는 것으로 기획 담당자가 확인했다.


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

관리자 전용 데모 스크립트는 심사 테스트를 위해 접수된 신청서에서 시작한다. 실제 사용자 최초 접수부터 확인하려면 위 최종 제출 API와 `verify-listing-submission.mjs`를 사용한다.

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
