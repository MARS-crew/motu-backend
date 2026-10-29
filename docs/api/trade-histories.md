# 거래내역

[← API 명세서 목차](README.md)

화면 USR-TRADE-01-01(거래내역), 01-02(체결주문), 01-03(미체결주문). 모두 **로그인 필요**입니다.

## 공통 규칙

| 요청 | 설명 |
|------|------|
| `from`, `to` | 조회 기간 (`YYYY-MM-DD`, 한국 날짜, 시작일·종료일 포함). 비우면 이번 달 1일 ~ 오늘 |
| `page`, `size` | 페이지 번호 방식. `page` 1부터, `size` 기본 10, 최대 50 |

| 응답 | 설명 |
|------|------|
| `from`, `to` | 실제로 조회한 기간. 기간을 비우고 호출했을 때 화면의 기간 표시에 씁니다. |
| `items`, `page`, `size`, `totalCount` | 목록과 페이지 정보 |

| 에러 | 상황 |
|------|------|
| 400 `TRADE_HISTORY_INVALID_PERIOD` "조회 시작일은 종료일보다 늦을 수 없습니다." | `from` > `to` |
| 400 "조회 기간은 YYYY-MM-DD 형식으로 입력해 주세요." | 날짜 형식 오류, 없는 날짜 |

- **포인트 리셋 이전 거래는 나오지 않습니다.** (리셋 시 거래내역 삭제) 체결 기록은 상대방 거래내역과 시세 차트에도 쓰여 실제로 지우지 않고, 리셋 시각 이후 거래만 보여 줍니다.
- 조회 결과가 없으면 `items`는 빈 배열, `totalCount`는 0입니다.
- 금액은 모두 체결가(주문 가격) × 수량이고 수수료는 넣지 않습니다. 수수료는 `fee`로 따로 내려줍니다.

## 거래 요약

| 항목 | 내용 |
|------|------|
| 화면 | USR-TRADE-01-01, 01-02 상단 |
| API | `GET /api/trade-histories/summary?from=&to=` |
| 응답 | `from`, `to`, `totalAmount`(총 거래금액), `buyAmount`(매수), `sellAmount`(매도) |

## 거래내역

| 항목 | 내용 |
|------|------|
| 화면 | USR-TRADE-01-01 |
| API | `GET /api/trade-histories?from=&to=&sort=&page=&size=` |
| 응답 | `items[] { tradeId, tradedAt, orderId, stockId, stockName, side, price, qty, amount, fee }` |

- 체결 **한 건씩** 나옵니다. 주문 하나가 여러 번에 나눠 체결되면 여러 줄입니다.
- 화면의 "거래금액"은 `amount`입니다.

| `sort` | 정렬 |
|------|------|
| `LATEST` (기본) | 최신순 |
| `AMOUNT` | 거래금액 큰 순 |
| `STOCK_NAME` | 상품명순 (영문은 대소문자 구분 없이 알파벳순, 한글은 가나다순, 영문이 먼저). 같은 상품은 최신순 |

## 체결주문

| 항목 | 내용 |
|------|------|
| 화면 | USR-TRADE-01-02 |
| API | `GET /api/trade-histories/filled-orders?from=&to=&sort=&page=&size=` |
| 응답 | `items[] { orderId, stockId, stockName, side, orderPrice, orderQty, filledQty, filledAmount, fee, status, filledAt }` |
| 정렬 | 거래내역과 같음 (`AMOUNT`는 `filledAmount` 기준) |

- 조회 기간에 체결이 있었던 **주문 단위**입니다. 부분 체결이면 실제 체결된 수량(`filledQty`)과 금액(`filledAmount`)만 들어갑니다.
- 기간 안 체결만 더합니다. 기간 밖에서 체결된 수량은 빠집니다.
- `filledAt`은 그 주문의 기간 안 마지막 체결 시각입니다.
- `status`: `PARTIAL` 일부 체결(남은 수량 대기 중), `FILLED` 전부 체결, `CANCELED` 일부 체결 후 남은 수량 취소

## 미체결주문

| 항목 | 내용 |
|------|------|
| 화면 | USR-TRADE-01-03 |
| API | `GET /api/trade-histories/open-orders?from=&to=&sort=&page=&size=` |
| 응답 | `items[] { orderId, stockId, stockName, side, price, qty, filledQty, remainingQty, orderAmount, status, orderedAt }` |

| `sort` | 정렬 |
|------|------|
| `LATEST` (기본) | 최신순 (주문 시각) |
| `AMOUNT` | 주문 금액 큰 순 |

- 조회 기간에 **접수한** 주문 중 미체결 수량이 남은 주문(`ACCEPTED` 접수, `PARTIAL` 일부 체결)만 나옵니다.
- 화면의 "50주 / 미체결 20주"는 `qty` / `remainingQty`, "주문금액"은 `orderAmount`(주문 가격 × 최초 주문 수량)입니다.
- 취소는 [주문 취소](orders.md#주문-취소)(`POST /api/orders/:orderId/cancel`)를 씁니다. 취소 모달의 "취소 수량"은 `remainingQty`입니다. 취소 후 목록을 다시 불러와 주세요.
