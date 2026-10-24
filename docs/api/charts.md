# 차트·시세

[← API 명세서 목차](README.md)

상품 상세의 당일 요약, 차트, 실시간 시세. 모두 **로그인 불필요**입니다.

상품 상세 화면은 아래 순서로 씁니다.

1. 화면에 들어오면 API로 현재 상태를 받습니다: [당일 거래 요약](#당일-거래-요약), [기간별 차트](#기간별-차트), [최근 체결](trades.md#최근-체결), [호가 5단계](orders.md#호가-5단계)
2. 동시에 [실시간 시세](#실시간-시세-sse)에 연결해, 이벤트가 올 때마다 화면 값을 바꿉니다.
3. 화면을 나가면 연결을 끊습니다.

## 하루·봉의 기준

- 하루는 **한국 시간 00시**에 바뀝니다.
- 봉 단위는 `MINUTE`(분), `HOUR`(시간), `DAY`(일), `WEEK`(주, 월요일 시작), `MONTH`(월)입니다. 일·주·월 봉도 한국 시간 00시 기준입니다.
- **체결이 없던 구간의 봉은 없습니다.** 빈 구간은 차트에서 이어 그리거나 비워 둡니다.

## 당일 거래 요약

| 항목 | 내용 |
|------|------|
| API | `GET /api/charts/summary?stockId=` |

| 응답 필드 | 설명 |
|------|------|
| `stockId` | 상품 ID |
| `currentPrice` | 현재가 = 마지막 체결가 |
| `prevClosePrice` | 전일 종가 = 오늘 이전의 마지막 체결가 |
| `changeAmount`, `changeRate` | 전일 대비 (P), 등락률 (%, 소수점 둘째 자리까지) |
| `openPrice`, `highPrice`, `lowPrice` | 오늘 시가·고가·저가 (오늘 체결이 없으면 null) |
| `volume`, `tradeAmount` | 오늘 거래량(주), 거래대금(P) (오늘 체결이 없으면 0) |

| 에러 | 상황 |
|------|------|
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |

- 한 번도 체결되지 않은 상품은 현재가와 전일 종가 모두 **기준가(상장가)** 이고, 전일 대비는 0입니다.
- 오늘 체결이 없으면 현재가는 전일 종가와 같습니다.
- 오늘 시가·고가·저가가 null이면 "-"로 표시합니다.

## 기간별 차트

| 항목 | 내용 |
|------|------|
| API | `GET /api/charts?stockId=&interval=&cursor=&size=` |
| 요청 | `interval`(필수, [봉 단위](#하루봉의-기준)), `cursor`, `size`(기본 100, **최대 500**) |
| 응답 | `stockId`, `interval`, `items[] { time, openPrice, highPrice, lowPrice, closePrice, volume, tradeAmount }`, `nextCursor` |

| 에러 | 상황 |
|------|------|
| 400 `BAD_REQUEST` | `interval`이 없거나 잘못됨, `size`가 범위를 벗어남 |
| 400 `CHART_INVALID_CURSOR` "차트를 처음부터 다시 불러와 주세요." | 잘못된 커서 |
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |

- 첫 호출은 **최신 봉부터** `size`개를 받습니다. `items`는 차트에 바로 넣을 수 있게 **오래된 순**입니다.
- 왼쪽(과거)으로 스크롤하면 `nextCursor`를 넘겨 그보다 이전 봉을 받아 앞에 붙입니다. `nextCursor`가 null이면 더 이전 봉이 없습니다.
- 커서 방식은 [공통 페이지네이션](common.md#페이지네이션)과 같지만, 차트는 한 번에 많이 그려야 해서 `size` 최대값이 500입니다.
- `interval`을 바꾸면 커서 없이 처음부터 다시 불러옵니다.
- `time`은 봉 시작 시각(UTC)입니다. 화면에는 한국 시간으로 바꿔 표시합니다.

## 실시간 시세 (SSE)

| 항목 | 내용 |
|------|------|
| API | `GET /api/charts/stream?stockId=` |
| 형식 | `text/event-stream` (Server-Sent Events) |

브라우저 기본 `EventSource`로 연결합니다. 연결하면 현재 `orderbook`과 `summary`를 먼저 한 번 보냅니다.

```js
const es = new EventSource(`${API_URL}/api/charts/stream?stockId=${stockId}`);
es.addEventListener('trade', (e) => { const trade = JSON.parse(e.data); /* ... */ });
es.addEventListener('orderbook', (e) => { /* ... */ });
es.addEventListener('summary', (e) => { /* ... */ });
es.addEventListener('candles', (e) => { /* ... */ });
// 화면을 나갈 때
es.close();
```

| 이벤트 | 언제 | `data` | 화면 처리 |
|------|------|------|------|
| `orderbook` | 연결 직후, 호가창이 바뀔 때(주문·체결·취소) | `{ stockId, asks, bids }` ([호가 5단계](orders.md#호가-5단계)와 같은 형식) | 호가 전체를 교체 |
| `summary` | 연결 직후, 체결 후 | [당일 거래 요약](#당일-거래-요약)과 같은 형식 | 현재가·등락률 등을 교체 |
| `trade` | 체결마다 | `{ tradeId, price, qty, side, createDate }` ([최근 체결](trades.md#최근-체결)의 항목과 같은 형식) | 최근 체결 목록 맨 위에 추가 |
| `candles` | 체결 후 | `{ stockId, items[] }` — 마지막 체결이 속한 분·시간·일·주·월 봉. 항목은 [기간별 차트](#기간별-차트)의 봉 + `interval` | 보고 있는 단위의 봉을 찾아, 차트의 마지막 봉과 `time`이 같으면 교체하고 다르면 뒤에 추가 |

| 에러 | 상황 |
|------|------|
| 400 `BAD_REQUEST` | `stockId`가 없거나 숫자가 아님 |
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 |

- `orderbook`·`summary`·`candles`는 짧은 시간(0.1초)에 여러 번 바뀌면 **마지막 상태만** 한 번 보냅니다. `trade`는 체결마다 모두 보냅니다.
- 15초마다 연결 유지용 주석(`: ping`)이 옵니다. `EventSource`는 이를 이벤트로 전달하지 않으므로 따로 처리할 필요가 없습니다.
- 에러(400, 404)는 일반 API처럼 JSON으로 응답하고, 이 경우 `EventSource`는 다시 연결하지 않습니다.
- 네트워크가 끊기면 `EventSource`가 자동으로 다시 연결합니다. 다시 연결되면 `orderbook`과 `summary`를 다시 받으므로 호가와 요약은 맞춰지지만, 끊긴 사이의 체결과 봉은 오지 않습니다. 필요하면 다시 연결된 뒤(`open` 이벤트) 최근 체결과 차트를 API로 다시 불러옵니다.
