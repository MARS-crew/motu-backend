# 상품

[← API 명세서 목차](README.md)

## 상품 목록 항목 (공통)

목록, 검색, 신규 상장, 최근 본 종목, 관심 상품 목록이 모두 이 형식입니다.

| 필드 | 설명 |
|------|------|
| `stockId`, `stockCode`, `name` | 상품 ID, 종목 코드, 상품명 |
| `sectorCode`, `sectorName` | 카테고리 |
| `logoImageUrl` | 로고 (null이면 기본 이미지) |
| `currentPrice` | 현재가 (P). 오늘 체결이 없으면 전일 종가, 체결된 적이 없으면 기준가 |
| `changeAmount`, `changeRate` | 전일 대비 변동 금액(P), 등락률(%) |
| `volume`, `tradeAmount` | 당일 거래량(주), 거래대금(P) |
| `listingDate` | 상장일 |
| `tradeStatus` | `PENDING` 거래 대기 / `ACTIVE` 거래 가능 / `PAUSED` 거래 중지 / `CLOSED` 거래 종료 |
| `isWishlisted` | 관심상품 여부 (비회원은 false) |

- 시세 값은 [당일 거래 요약](charts.md#당일-거래-요약)과 같은 값입니다. 하루 기준은 한국 시간 00시이고, 오늘 체결이 없으면 거래량·거래대금은 0입니다.
- 거래 대기·중지·종료 상품도 목록에 나옵니다. (기획 문의 중) 삭제된 상품과 관리자가 **비공개**로 둔 상품은 빠집니다.
- 비공개 상품은 상품 목록·검색·신규 상장·최근 본 종목·관심상품 목록에서 빠지고 관심상품으로 등록할 수도 없습니다(404 `STOCK_NOT_FOUND`). 상품 상세·주문·보유 내역은 그대로 볼 수 있습니다.

## 카테고리

| 항목 | 내용 |
|------|------|
| 화면 | USR-MARKET-01 (카테고리 버튼) |
| API | `GET /api/sectors` |
| 로그인 | 불필요 |
| 응답 | `items[] { sectorCode, sectorName }` — 9개, 코드순 (SaaS/소프트웨어, AI/데이터, 핀테크, 커머스/유통, 콘텐츠/미디어, 헬스케어, 교육, 모빌리티, 기타) |

## 상품 목록 (마켓)

| 항목 | 내용 |
|------|------|
| 화면 | USR-MARKET-01 |
| API | `GET /api/stocks?sectorCode=&sort=&cursor=&size=` |
| 로그인 | 선택 (관심 여부) |
| 요청 | `sectorCode`(비우면 전체), `sort`, [커서](common.md#페이지네이션) |
| 응답 | `items[]`(상품 목록 항목), `nextCursor` |

| `sort` | 정렬 |
|------|------|
| `TRADE_AMOUNT` (기본) | 거래대금 많은순 |
| `CHANGE_RATE_DESC` | 등락률 높은순 |
| `CHANGE_RATE_ASC` | 등락률 낮은순 |
| `VOLUME` | 거래량 많은순 |
| `LISTING_DATE` | 최근 상장순 |

- 정렬 값이 같으면 최근 상장순입니다. 체결이 없는 날에는 시세 기준 정렬이 최근 상장순과 같아집니다.
- 시세는 체결마다 바뀌므로, 다음 페이지를 불러오는 사이 순위가 바뀌면 상품이 빠지거나 겹칠 수 있습니다. 당겨서 새로고침하면 첫 페이지부터 다시 불러와 주세요.
- 결과가 없으면 빈 배열입니다.

## 신규 상장

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01 (3개), USR-HOME-01-05 (전체) |
| API | `GET /api/stocks/new-listings?cursor=&size=` |
| 로그인 | 선택 (관심 여부) |
| 응답 | `items[]`(상품 목록 항목 + `summary` 한 줄 소개, `isNew` 상장 후 7일 이내), `nextCursor` |

- 홈 화면은 `size=3`으로 호출합니다. 최근 상장순입니다.

## 상품 상세

| 항목 | 내용 |
|------|------|
| 화면 | USR-MARKET-02-01 (상단 종목 정보), USR-MARKET-02-03 (종목정보 탭) |
| API | `GET /api/stocks/:stockId` |
| 로그인 | 선택 (관심 여부, 최근 본 종목 기록) |

| 응답 필드 | 설명 |
|------|------|
| `stockId`, `stockCode`, `name` | |
| `summary` | 한 줄 소개 (상품명 아래) |
| `description` | 상품 소개 (종목정보 탭, null 가능) |
| `sectorCode`, `sectorName` | 카테고리 |
| `logoImageUrl`, `mainImageUrl` | 로고(null 가능), 대표 이미지 |
| `officialUrl` | 공식 URL (null 가능) |
| `operatorName` | 운영사 |
| `metrics` | 주요 서비스 지표 `{ mau, dau, revenue, transactionVolume, startDate, endDate }` — 값이 없으면 각각 null |
| `listingDate`, `tradeStatus` | 상장일, 거래 상태 |
| `statusNotice` | 거래 중지·종료 안내문 (관리자가 입력, 없으면 null) |
| `currentPrice`, `changeAmount`, `changeRate` | 현재가, 전일 대비 |
| `isWishlisted` | 관심상품 여부 |

| 에러 | 상황 |
|------|------|
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |
| 400 `BAD_REQUEST` | `stockId`가 숫자가 아님 |

- 지표나 정보 값이 null이면 화면에 "정보없음"을 표시합니다.
- 지표는 상장 신청에서 입력한 MAU, DAU, 연간 매출(원), 거래액(원), 집계 기간입니다. (화면 예시의 누적 가입자·평균 수익률은 받지 않음)
- 거래 대기·중지·종료 상품은 매수·매도 버튼을 비활성화합니다. (SRS No.12)
- 거래 중지·종료 상품은 `statusNotice`가 있으면 상품 상세에 안내로 표시합니다. 종료 상품은 '거래 종료 안내'에 이 문구를 씁니다(ADM-PRD-05 사용자 앱 예시).
- 호가·차트·체결 탭은 [호가 5단계](orders.md#호가-5단계), [차트·시세](charts.md), [최근 체결](trades.md#최근-체결)을 씁니다.

## 최근 본 종목

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01 |
| API | `GET /api/stocks/recently-viewed` |
| 로그인 | 필요 (홈에서 비회원이면 호출하지 않고 빈 상태 표시) |
| 응답 | `items[]`(상품 목록 항목), 최근 본 순서, 최대 3개 |

- 로그인한 상태로 [상품 상세](#상품-상세)를 조회할 때 기록됩니다. 같은 상품을 다시 보면 맨 위로 올라갑니다.
- 최근 본 상품이 삭제되거나 비공개가 되면 그 자리가 비어 3개보다 적게 나올 수 있습니다.

---

## 관리자 상품 관리

모두 **관리자** 토큰이 필요합니다. 화면은 `[2차 개발]모투화면설계서.pptx`의 ADM-PRD-01·02입니다. 비공개 상품도 나옵니다.

### 상장 상품 목록 (ADM-PRD-01)

`GET /api/admin/stocks`

| 쿼리 | 설명 |
|------|------|
| `keyword` | 상품명·상품 코드 부분 일치, 또는 상품 ID(`18`, `018`, `PRD-018`). 30자 이내 |
| `tradeStatus` | 상품 상태: `PENDING` 거래 대기, `ACTIVE` 거래 가능, `PAUSED` 거래 중지, `CLOSED` 거래 종료 |
| `sectorCode` | 카테고리 코드 ([카테고리](#카테고리) 목록의 코드) |
| `visibility` | 노출 상태: `PUBLIC` 공개, `PRIVATE` 비공개 |
| `page`, `size` | 페이지(1부터), 한 페이지 건수(기본 20, 최대 100) |

응답 `items[]`: `stockId`, `stockCode`, `name`, `sectorCode`, `sectorName`, `tradeStatus`, `isPublic`, `listingDate`(거래 시작일시), `currentPrice`. 최근 등록순이며 `page`, `size`, `totalCount`를 같이 내려줍니다.

- 화면의 상품 ID는 `stockId`에 `PRD-` 접두어를 붙여 표시합니다. (예: `PRD-018`)
- 거래 대기 상품은 체결가가 없어 `currentPrice`가 null입니다. 화면에는 `-`로 표시합니다.
- 상장 승인 전 신청 상태는 상장 신청 목록(ADM-LST-01)에서 조회합니다.
- 카테고리는 설계서의 5개 목록 대신 `GET /api/sectors`로 받은 목록을 씁니다. (카테고리 기준 확인 중)

### 상장 상품 상세 (ADM-PRD-02)

`GET /api/admin/stocks/:stockId`

목록 항목에 더해 아래 값을 내려줍니다.

| 탭 | 필드 |
|------|------|
| 기본 정보 | `summary`(한 줄 소개), `description`(상품 소개), `operatorName`, `officialUrl`, `logoImageUrl`, `mainImageUrl`, `isPublic` |
| 거래 정보 | `currentPrice`, `listedShares`(총 발행량), `listingDate`(거래 시작일시), `openOrderCount`(미체결 주문 건수), `tradeStatus`, `statusNotice`(사용자 안내문) |
| 서비스 지표 (ADM-PRD-02-02) | `metrics { mau, transactionVolume, baseDate }`. 값이 없으면 null이고 화면에는 '미등록'으로 표시합니다. |
| 변경 이력 (ADM-PRD-02-01) | [관리자 활동 이력](admin-activity-logs.md) `GET /api/admin/activity-logs?targetType=STOCK&targetId={stockId}` |

- `metrics.baseDate`(지표 기준일)는 상장 신청에서 받은 지표 집계 기간의 종료일이고, [정보 수정](#상장-상품-정보-수정-adm-prd-03)에서 바꿀 수 있습니다.
- 상품 상태에 따라 버튼을 보여 줍니다: 거래 가능 → [거래 중지]·[상품 종료], 거래 중지 → [거래 재개]·[상품 종료], 거래 대기 → [상품 종료], 거래 종료 → 없음.

| 에러 | 상황 |
|------|------|
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |
| 400 `BAD_REQUEST` | 쿼리 값 오류 (상태·노출 상태 값, 페이지 범위 등) |
| 403 `AUTH_FORBIDDEN` | 관리자가 아님 |

### 상장 상품 정보 수정 (ADM-PRD-03)

`PATCH /api/admin/stocks/:stockId`

| 요청 | 필수 | 설명 |
|------|------|------|
| `name` | O | 상품명 1~30자 |
| `sectorCode` | O | 카테고리 코드 ([카테고리](#카테고리), DB 9개 기준) |
| `isPublic` | O | 노출 상태 (true 공개, false 비공개) |
| `reason` | O | 수정 사유 1~200자 |
| `summary` |  | 한 줄 소개 1~60자. 보내지 않으면 그대로 |
| `description` |  | 상품 소개 500자 이내. null이면 지움 |
| `officialUrl` |  | 공식 URL (https, 500자 이내). null이면 지움 |
| `mau`, `transactionVolume` |  | 서비스 지표 (0 이상 정수). null이면 지움 |
| `metricsBaseDate` |  | 지표 기준일 `YYYY-MM-DD`. MAU나 거래액이 남아 있으면 필수 |

응답: 수정된 [상장 상품 상세](#상장-상품-상세-adm-prd-02)

- 선택 항목은 **보내지 않으면 그대로**, **null을 보내면 지웁니다.** 화면 폼을 그대로 보내면 됩니다.
- 바뀐 항목만 저장하고, 변경 전·후 값과 사유를 관리자 활동 이력(`STOCK_UPDATE`)에 남깁니다. 변경 내용 확인 모달은 프론트에서 기존 상세와 비교해 보여 줍니다.
- 거래 상태는 이 API로 바꾸지 않습니다. 아래 거래 중지·재개·종료를 씁니다.
- 대표 이미지 변경은 아직 지원하지 않습니다. 승인된 상품의 이미지를 어떻게 저장·제공할지 상장 승인 작업과 함께 정합니다.

| 에러 | 상황 |
|------|------|
| 400 `STOCK_NOT_CHANGED` | 바뀐 항목이 없음 |
| 400 `STOCK_METRICS_DATE_REQUIRED` | MAU·거래액이 있는데 지표 기준일이 없음 |
| 400 `STOCK_SECTOR_NOT_FOUND` | 없는 카테고리 코드 |
| 400 `BAD_REQUEST` | 필수값 누락, 길이·형식 오류 (사유 누락이면 "사유 입력은 필수입니다.") |
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |

### 거래 중지·재개 (ADM-PRD-04), 상품 종료 (ADM-PRD-05)

| 기능 | API | 요청 | 할 수 있는 상태 |
|------|------|------|------|
| 거래 중지 | `POST /api/admin/stocks/:stockId/pause` | `reason`(필수), `notice`(사용자 안내문, 선택 200자) | 거래 가능 |
| 거래 재개 | `POST /api/admin/stocks/:stockId/resume` | `reason`(필수) | 거래 중지 |
| 상품 종료 | `POST /api/admin/stocks/:stockId/close` | `reason`(필수), `notice`(사용자 안내문, **필수** 1~200자) | 거래 대기·가능·중지 |

응답: `stockId`, `statusBefore`, `statusAfter`, `canceledOrderCount`(취소한 미체결 주문 수, 재개는 0)

- **거래 중지와 종료는 미체결 주문을 모두 취소하고 예약 포인트·수량을 해제**합니다. 호가창도 비워집니다. 중지 확인 화면의 "미체결 주문 N건 취소"는 상세의 `openOrderCount`를 씁니다.
- 거래 중지 중에는 신규 주문이 `ORDER_STOCK_NOT_TRADABLE`로 막힙니다. 재개하면 그때부터 주문을 다시 받습니다.
- 상품 종료는 되돌릴 수 없습니다. 이미 체결해 보유한 수량은 그대로 남고 자동 매도·환급은 없습니다. 켜진 지정가 알림도 끕니다.
- 안내문은 사용자 상품 상세의 `statusNotice`로 나갑니다. 재개하면 지웁니다.
- 처리 전·후 상태, 안내문, 취소한 주문 수, 사유를 관리자 활동 이력(`STOCK_PAUSE`, `STOCK_RESUME`, `STOCK_CLOSE`)에 남깁니다.
- 이상 거래 상세(ADM-MON-02)에서 "상품 거래 중지"로 넘어온 경우도 같은 거래 중지 API를 씁니다. 처리 후 이상 거래 상세로 돌아가는 것은 프론트에서 처리합니다.

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `STOCK_INVALID_TRADE_STATUS` + `details { tradeStatus }` | 지금 상태에서 할 수 없는 처리 (예: 이미 중지된 상품 중지, 종료된 상품 재개) | 상세를 다시 불러옵니다. |
| 400 `BAD_REQUEST` | 사유 누락, 종료 안내문 누락, 길이 초과 | 입력칸 아래 안내 |
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 | |


## 상장 심사 승인 상품 연결

상장 심사 승인으로 생성된 상품은 `PENDING`이고, 확정 거래 시작일시에 기존 발행·최초 매도 주문 로직으로 `ACTIVE`가 된다. 상세 규칙은 [상장 심사](listing-applications.md#승인-입력값과-상품-생성-규칙)를 참고한다. 기존 사용자·관리자 상품 API의 `listingDate` 의미는 거래 시작일시로 유지한다. 확정 상장일은 별도 `approvedListingDate`(KST 날짜)이며 관리자 상품 상세에 추가된다. 기존 상품의 값은 null이다.

승인 상품의 로고·대표 이미지 URL은 `/api/stocks/listing-images/{신청서 ID}/logo` 또는 `/main`이다. 공개 상품만 로그인 없이 조회할 수 있으며 증빙자료는 공개하지 않는다.
