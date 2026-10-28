# 지정가 알림

[← API 명세서 목차](README.md)

화면 USR-MARKET-02-M01 (지정가 알림 설정·수정·해제 모달). 모두 **로그인 필요**입니다.

| 기능 | API | 응답 |
|------|------|------|
| 설정 | `POST /api/price-alerts` | 201, 알림 |
| 수정 | `PATCH /api/price-alerts/:alertId` | 200, 알림 |

## 알림 규칙

| 항목 | 규칙 |
|------|------|
| 도달 | 체결가가 설정 가격과 같거나, 직전 체결가와 이번 체결가 사이에 설정 가격이 있으면 도달입니다. 오르는지 내리는지는 구분하지 않습니다. 6,990P → 7,010P처럼 설정 가격 7,000P를 건너뛰어도 도달입니다. |
| 횟수 | 처음 도달했을 때 **한 번만** 알립니다. 알림이 울리면 `isActive`가 false가 되고 `triggeredDate`에 체결 시각이 들어갑니다. |
| 다시 켜기 | 수정하면 다시 켜집니다. 같은 가격으로 "수정 완료"를 눌러도 다시 켜집니다. |
| 개수 | 한 상품에 가격이 다른 알림을 여러 개 설정할 수 있습니다. 같은 상품에 같은 가격은 하나만 됩니다(울린 알림 포함). |
| 상품 상태 | `ACTIVE`, `PAUSED` 상품만 설정·수정할 수 있습니다. 상품의 거래가 종료(`CLOSED`)되면 켜진 알림이 모두 꺼집니다. |
| 알림 내역 | 울린 알림은 [알림 목록](notifications.md)에 `type: "PRICE"`로 쌓입니다. 알림을 해제해도 이미 쌓인 내역은 남습니다. |

## 설정

설정 모달(①)에서 "알림 설정"(④)을 누르면 호출합니다. 모달의 현재가는 [당일 거래 요약](charts.md)의 `currentPrice`를 씁니다.

```json
{ "stockId": 1, "targetPrice": 7000 }
```

`targetPrice`는 상품의 [주문 규칙](orders.md#상품별-주문-규칙)과 같은 규칙을 따릅니다. 호가 단위의 배수여야 하고 최소 주문 가격 이상이어야 합니다. 현재가와 같은 가격은 설정할 수 없습니다(이미 도달한 상태).

| 에러 | 상황 | 처리 |
|------|------|------|
| 400 `BAD_REQUEST` | 값 형식 오류 | |
| 400 `PRICE_ALERT_INVALID_PRICE_TICK` + `details { priceTickSize }` | 호가 단위가 맞지 않음 | 입력창 아래 안내 |
| 400 `PRICE_ALERT_PRICE_TOO_LOW` + `details { minOrderPrice }` | 최소 주문 가격보다 낮음 | 입력창 아래 안내 |
| 400 `PRICE_ALERT_SAME_AS_CURRENT_PRICE` + `details { currentPrice }` | 현재가와 같음 | 입력창 아래 안내 |
| 404 `STOCK_NOT_FOUND` | 없거나 삭제된 상품 | |
| 409 `PRICE_ALERT_STOCK_NOT_ALERTABLE` + `details { tradeStatus }` | 거래 대기·종료 상품 | 알림 버튼 비활성화 |
| 409 `PRICE_ALERT_DUPLICATE` | 같은 상품에 같은 가격의 알림이 이미 있음 | 기존 알림을 수정하도록 안내 |

## 수정

수정 모달(⑤)에서 "수정 완료"(⑧)를 누르면 호출합니다. 설정 가격을 바꾸고 알림을 다시 켭니다.

```json
{ "targetPrice": 7500 }
```

에러는 [설정](#설정)과 같고, 없거나 다른 회원의 알림이면 404 `PRICE_ALERT_NOT_FOUND`입니다.
