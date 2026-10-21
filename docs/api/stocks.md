# 상품

[← API 명세서 목차](README.md)

현재가·등락률·거래량·거래대금은 [아직 실제 값이 아닙니다](README.md#아직-구현되지-않은-것).

## 상품 목록 항목 (공통)

목록, 검색, 신규 상장, 최근 본 종목, 관심 상품 목록이 모두 이 형식입니다.

| 필드 | 설명 |
|------|------|
| `stockId`, `stockCode`, `name` | 상품 ID, 종목 코드, 상품명 |
| `sectorCode`, `sectorName` | 카테고리 |
| `logoImageUrl` | 로고 (null이면 기본 이미지) |
| `currentPrice` | 현재가 (P) |
| `changeAmount`, `changeRate` | 전일 대비 변동 금액(P), 등락률(%) |
| `volume`, `tradeAmount` | 당일 거래량(주), 거래대금(P) |
| `listingDate` | 상장일 |
| `tradeStatus` | `PENDING` 거래 대기 / `ACTIVE` 거래 가능 / `PAUSED` 거래 중지 / `CLOSED` 거래 종료 |
| `isWishlisted` | 관심상품 여부 (비회원은 false) |

- 거래 대기·중지·종료 상품도 목록에 나옵니다. (기획 문의 중) 삭제된 상품만 빠집니다.

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

- 시세 값이 생기기 전까지는 모든 정렬이 최근 상장순으로 동작합니다.
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
| `currentPrice`, `changeAmount`, `changeRate` | 현재가, 전일 대비 |
| `isWishlisted` | 관심상품 여부 |

| 에러 | 상황 |
|------|------|
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |
| 400 `BAD_REQUEST` | `stockId`가 숫자가 아님 |

- 지표나 정보 값이 null이면 화면에 "정보없음"을 표시합니다.
- 지표는 상장 신청에서 입력한 MAU, DAU, 연간 매출(원), 거래액(원), 집계 기간입니다. (화면 예시의 누적 가입자·평균 수익률은 받지 않음)
- 거래 대기·중지·종료 상품은 매수·매도 버튼을 비활성화합니다. (SRS No.12)
- 호가·차트·체결 탭은 [아직 구현 전](README.md#아직-구현되지-않은-것)입니다.

## 최근 본 종목

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01 |
| API | `GET /api/stocks/recently-viewed` |
| 로그인 | 필요 (홈에서 비회원이면 호출하지 않고 빈 상태 표시) |
| 응답 | `items[]`(상품 목록 항목), 최근 본 순서, 최대 3개 |

- 로그인한 상태로 [상품 상세](#상품-상세)를 조회할 때 기록됩니다. 같은 상품을 다시 보면 맨 위로 올라갑니다.
- 최근 본 상품이 삭제되면 그 자리가 비어 3개보다 적게 나올 수 있습니다.
