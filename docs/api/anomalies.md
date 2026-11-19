# 거래 모니터링 (이상 거래)

[← API 명세서 목차](README.md)

관리자 거래 모니터링의 이상 거래 탐지·조회·조치입니다. 모두 **관리자** 토큰이 필요합니다.

- 화면: `[2차 개발]모투화면설계서.pptx`의 ADM-MON-01 거래 및 주문 모니터링, ADM-MON-02 이상 거래 상세 / SRS 61
- 탐지 결과는 조치 전 확인 자료입니다. **상품·회원 상태를 자동으로 바꾸지 않습니다.** 조치는 관리자가 상세에서 합니다.

## 탐지 기준

주문·체결이 커밋된 뒤 서버가 확인해서 남깁니다. 탐지가 실패해도 주문·체결에는 영향이 없습니다.

| 탐지 유형 | `type` | 기준 | 오류 내용 (`errorCode`) |
|------|------|------|------|
| 대량 주문 | `LARGE_ORDER` | 주문 수량이 상품 발행량의 **1% 이상** | 대량 주문 탐지 (`LARGE_ORDER`) |
| 반복 주문 | `REPEATED_ORDER` | 같은 회원이 같은 상품에 **최근 60초 안에 10건 이상** 주문(매수·매도 합산). 같은 회원·상품은 10분 안에 다시 남기지 않음 | 반복 주문 탐지 (`REPEATED_ORDER`) |
| 비정상 가격 체결 | `ABNORMAL_PRICE` | 체결가가 **직전 체결가(첫 체결이면 상장가)에서 30%를 넘게** 벗어남. 원인 회원은 새로 들어온 주문 쪽 | 가격 편차 초과 (`PRICE_DEVIATION`) |
| 주문 처리 실패 | `ORDER_FAILURE` | 주문 처리 중 예상하지 못한 에러(트랜잭션 시간 초과, DB 오류 등). 잔액 부족 같은 업무 규칙 거부는 제외 | 주문 처리 실패 (`ORDER_FAILED`) |
| 잔액 불일치 | `BALANCE_MISMATCH` | 예약 포인트 ≠ 미체결 매수 주문의 예약 합, 또는 예약 포인트 > 보유 포인트 | 예약 포인트 불일치 (`LOCKED_CASH_MISMATCH`) |
| | | 예약 수량 ≠ 그 상품 미체결 매도 주문의 남은 수량 합, 또는 예약 수량 > 보유 수량 | 예약 수량 불일치 (`LOCKED_QTY_MISMATCH`) |

- 기준값은 기획에서 확정해 화면설계서 ADM-MON-01에 반영된 값입니다(2026-11-18). 바뀌면 `anomalies.constants.ts`에서 고칩니다.
- 잔액 불일치는 같은 회원·항목이 처리 전이면 다시 남기지 않습니다. 예약 포인트 불일치는 상품과 관계없어 `stockId`가 null입니다.

## 이상 거래 목록 (ADM-MON-01)

`GET /api/admin/anomalies`

| 쿼리 | 설명 |
|------|------|
| `type` | 탐지 유형 (위 표의 `type`) |
| `status` | 처리 상태: `PENDING` 미처리, `REVIEWING` 확인중, `RESOLVED` 처리완료 |
| `keyword` | 상품 ID(`PRD-018`) 또는 회원 ID(`USR-1024`). 숫자만 보내면 상품·회원 ID를 모두 찾습니다. |
| `from`, `to` | 발생 기간 (시간대 포함 일시, `from` 포함·`to` 미포함). 최대 1년 |
| `page`, `size` | 페이지(1부터), 한 페이지 건수(기본 20, 최대 100) |

응답

| 필드 | 설명 |
|------|------|
| `items[]` | `anomalyId`, `type`, `status`, `detectedDate`(발생일시), `stockId`, `stockName`, `userId`, `loginId`, `errorCode`, `errorMessage`(오류 내용). 최신 발생순 |
| `page`, `size`, `totalCount` | 페이지 정보 |
| `summary` | 상단 건수. `totalCount`(이상 거래), `pendingCount`(미처리), `typeCounts { 유형: 건수 }`(없는 유형은 0). **현재 조회 조건 기준**입니다. |

- 기본 기간(최근 24시간)과 최근 7일·30일 버튼은 프론트가 `from`을 계산해서 보냅니다. 직접 설정은 KST 시작·종료 일시를 그대로 보냅니다.
- 화면의 상품 ID는 `stockId`에 `PRD-`, 회원 ID는 `userId`에 `USR-` 접두어를 붙여 표시합니다.

## 이상 거래 상세 (ADM-MON-02)

`GET /api/admin/anomalies/:anomalyId`

목록 항목에 더해 아래 값을 내려줍니다. 조회만으로 처리 상태를 바꾸지 않습니다.

| 영역 | 필드 |
|------|------|
| 탐지 정보 | `stockCode`, `nickname`, `orderId`(관련 주문, 없으면 null), `tradeId`(관련 체결, 비정상 가격 체결만) |
| 탐지 근거 | `evidence { 항목: 값 }` (유형별 항목은 아래) |
| 처리 결과 | `action`(확인중이면 넘어간 조치, 처리완료면 확정한 조치), `actionReason`, `handledBy { adminId, loginId }`, `handledDate` |

`evidence` 항목

| 유형 | 항목 |
|------|------|
| 대량 주문 | `side`, `orderPrice`, `orderQty`, `listedShares`(발행량), `sharePercent`(발행량 대비 %), `thresholdPercent`(기준 %) |
| 반복 주문 | `orderCount`(1분간 주문 수), `windowSeconds`, `minCount`, `firstOrderDate`, `lastOrderDate` |
| 비정상 가격 체결 | `orderQty`(주문 수량), `filledQty`(체결 수량), `basePrice`(기준 가격 = 직전 체결가), `tradePrice`(체결 가격), `deviationPercent`(편차 %), `assetDifference`(자산 차이 = (기준 가격 − 체결 가격) × 체결 수량, 비싸게 체결되면 음수) |
| 주문 처리 실패 | `side`, `orderPrice`, `orderQty`, `errorName`, `errorCode`(DB 에러 코드, 없으면 null), `errorMessage`, `failedDate` |
| 잔액 불일치 (포인트) | `item: CASH`, `cash`, `lockedCash`(예약 포인트), `expectedLockedCash`(미체결 매수 예약 합), `difference` |
| 잔액 불일치 (수량) | `item: QTY`, `qty`, `lockedQty`(예약 수량), `expectedLockedQty`(미체결 매도 남은 수량 합), `difference` |

- 설계서의 `MON-260903-007` 같은 표시 번호는 프론트가 `detectedDate`(KST)와 `anomalyId`로 만듭니다.

| 에러 | 상황 |
|------|------|
| 404 `ANOMALY_NOT_FOUND` | 없는 이상 거래 |
| 400 `ANOMALY_INVALID_PERIOD` | 발생 기간 시작이 끝보다 늦거나 1년 초과 |
| 400 `BAD_REQUEST` | 쿼리 값 오류 (유형·상태 값, ID 형식 등) |

## 조치 (ADM-MON-02 4~6번)

| 조치 | 흐름 |
|------|------|
| 상품 거래 중지 | ① [조치 내용 확인] `POST /api/admin/anomalies/:anomalyId/review` `{ action: STOCK_PAUSE }` → 확인중 ② [거래 중지](stocks.md#거래-중지재개-adm-prd-04-상품-종료-adm-prd-05) 화면에서 `POST /api/admin/stocks/:stockId/pause`에 **`anomalyId`를 함께** 보내 확정 → 처리완료 |
| 회원 정지 | ① `POST /api/admin/anomalies/:anomalyId/review` `{ action: USER_BLOCK }` → 확인중 ② [회원 상태 변경](users.md#회원-상태-변경-adm-mbr-02-01) 화면에서 `PATCH /api/admin/users/:userId/status` `{ status: BLOCKED, anomalyId }`로 확정 → 처리완료 |
| 이상 없음 | 확인 모달에서 `POST /api/admin/anomalies/:anomalyId/dismiss` `{ reason }` → 바로 처리완료 |

- 응답: `review`·`dismiss`는 바뀐 [이상 거래 상세](#이상-거래-상세-adm-mon-02)를 돌려줍니다.
- 조치 사유는 이상 거래 상세에서 입력하고, 넘어간 화면에 프론트가 그대로 채워 보냅니다. 확정한 화면의 `reason`이 이상 거래의 `actionReason`이 됩니다.
- 넘어간 화면에서 취소하면 상품 거래 중지·회원 정지는 실행하지 않고 확인중으로 남습니다. 다시 상세에서 다른 조치를 고를 수 있습니다. 이 처리 상태 흐름은 화면설계서 ADM-MON-02에 반영되어 있습니다.
- 거래 중지·회원 정지는 원래 이력(`STOCK_PAUSE`, `USER_STATUS_CHANGE`)과 함께, 처리완료한 이상 거래를 관리자 활동 이력(`ANOMALY_ACTION`)에 남깁니다. 같은 트랜잭션이라 하나가 실패하면 모두 취소됩니다.
- `anomalyId`의 상품·회원이 요청 대상과 다르면 **거래 중지(미체결 주문 취소) 전에** 400으로 막습니다.

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `ANOMALY_ALREADY_RESOLVED` | 이미 처리완료 (다른 관리자가 먼저 처리한 경우 포함) | 상세를 다시 불러옵니다. |
| 400 `ANOMALY_TARGET_MISMATCH` | 이상 거래의 상품·회원과 조치 대상이 다름, 상품이 없는 이상 거래(예약 포인트 불일치)를 거래 중지 | |
| 400 `ANOMALY_INVALID_ACTION` | 회원 상태 변경에서 정지(`BLOCKED`)가 아닌 상태로 `anomalyId`를 보냄 | |
| 400 `BAD_REQUEST` | `review`의 조치 유형 누락, `dismiss`의 사유 누락·길이 초과 | 입력칸 아래 안내 |
| 404 `ANOMALY_NOT_FOUND` | 없는 이상 거래 | |
