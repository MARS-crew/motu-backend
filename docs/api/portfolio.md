# 포트폴리오

[← API 명세서 목차](README.md)

## 내 포트폴리오

| 항목 | 내용 |
|------|------|
| 화면 | USR-PF-01 |
| API | `GET /api/portfolio` |
| 로그인 | 필요 |
| 응답 | 아래 표 |

| 필드 | 설명 |
|------|------|
| `totalAsset` | 총 자산 (P) = `cash` + `evaluationAmount` |
| `cash` | 예수금 (P). 매수 주문에 예약된 포인트 포함. 자산관리의 보유 포인트와 같은 값 |
| `lockedCash`, `availableCash` | 예약 포인트, 사용 가능 예수금 (`cash - lockedCash`) |
| `evaluationAmount` | 보유 상품 평가금액 합계 (P) |
| `purchaseAmount` | 보유 상품 매입 금액 합계 (P, 매수 수수료 포함) |
| `profitLoss`, `profitRate` | 평가손익 (P) = 평가금액 - 매입 금액, 총 수익률 (%) = 평가손익 ÷ 매입 금액 |
| `cashRatio` | 총 자산에서 예수금 비율 (%, 도넛 차트) |
| `holdings[]` | 보유 종목 전체 (페이지 없음). 평가금액이 큰 순서이며, 다른 정렬(등락률·거래대금·거래량·상장일 등)은 화면에서 아래 필드로 정렬 |
| `baseTime` | 시세 기준 시각. 이 시각의 현재가로 계산 |

| `holdings[]` 필드 | 설명 |
|------|------|
| `stockId`, `stockCode`, `name`, `logoImageUrl`, `tradeStatus` | 상품 정보 |
| `qty`, `sellableQty` | 보유 수량 (매도 주문에 묶인 수량 포함), 매도 가능 수량 |
| `avgPrice` | 평균 매입 단가 (P) = 매입 금액 ÷ 보유 수량. 매수 수수료 포함, 소수점 둘째 자리까지 |
| `currentPrice` | 현재가 (P). [상품 목록](stocks.md#상품-목록-항목-공통)과 같은 값 |
| `changeAmount`, `changeRate` | 전일 대비 변동 금액 (P), 당일 등락률 (%). 상품 목록과 같은 값 |
| `volume`, `tradeAmount` | 당일 거래량 (주), 당일 거래대금 (P). 체결이 없으면 0 |
| `listingDate` | 상장일 |
| `purchaseAmount`, `evaluationAmount` | 매입 금액, 평가금액 (= 현재가 × 보유 수량) |
| `profitLoss`, `profitRate` | 평가손익 (P), 수익률 (%) |
| `assetRatio` | 총 자산에서 이 종목 비율 (%, 도넛 차트) |

- 비율·수익률은 소수점 둘째 자리까지 반올림합니다. 반올림 때문에 `cashRatio`와 `assetRatio` 합계가 100에서 0.01 정도 차이 날 수 있습니다.
- 보유 종목이 없으면 `holdings`는 빈 배열, 수익률은 0, `cashRatio`는 100입니다. 총 자산이 0이면 비율은 모두 0입니다.
- 매도로 보유 수량이 0이 되면 그 종목은 목록에서 빠집니다.
- 평가손익은 아직 팔지 않은 보유분 기준입니다. 이미 매도한 손익(실현손익)은 포함하지 않습니다.
