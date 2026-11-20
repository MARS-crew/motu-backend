# 대시보드

[← API 명세서 목차](README.md)

관리자 운영 대시보드의 지표 카드, 거래량·거래대금 추이와 그 지표를 위한 일별 통계입니다.

- 화면: `[2차 개발]모투화면설계서.pptx`의 ADM-DB-01 운영 현황, ADM-DB-01-01 거래대금 선택 상태
- 최근 운영 이력은 [관리자 활동 이력](admin-activity-logs.md)의 `GET /admin/activity-logs`를 쓴다.

모두 **관리자** 토큰이 필요하다. 하루 기준은 한국 시간 00시다.

| 화면 요소 | API |
|---|---|
| 상단 카드 (전체 회원·상장 상품·처리 대기·이상 거래) | `GET /admin/dashboard/kpis` |
| 거래량·거래대금 추이 | `GET /admin/dashboard/trade-trend` |
| 최근 운영 이력 · 7일 | `GET /admin/activity-logs?from=7일 전&size=4` |

## 지표 카드

`GET /admin/dashboard/kpis` — 화면 진입·새로고침 시 호출한다. 지금 값을 세고 어제 마감 값과 비교한다.

| 카드 | 값 | 전일 대비 |
|---|---|---|
| 전체 회원 `userCount` | 일반 회원 수 (잠김·정지 포함, 관리자·탈퇴 회원 제외) | `userChangeRate` 증감률(%, 소수점 둘째 자리). 오늘 00시 전에 가입했고 그때 탈퇴하지 않은 회원 수와 비교한다. 0명이면 `null` |
| 상장 상품 `listedStockCount` | 거래 중·거래 중지 상품 수 | `listedStockChange` 건수 차이 |
| 처리 대기 `pendingCount` | 상장 심사 대기 `pendingListingCount` + 계정 문의 대기 `pendingInquiryCount` | `pendingChange` 건수 차이 |
| 이상 거래 `anomalyCount` | 오늘 탐지된 건수 | `anomalyChange` 오늘 − 어제 탐지 건수 |

- 상장 상품·처리 대기는 일별 통계의 어제 행과 비교한다. 어제 행이 없거나 밀린 날이라 값이 없으면 `null`이다. 00시가 지나고 배치가 돌기 전(최대 약 11분)에도 `null`일 수 있으니 화면은 증감 표시를 숨긴다.
- 상장 심사 대기는 접수(`SUBMITTED`)와 검토 중(`UNDER_REVIEW`)을 센다. 보완 요청(`REVISION_REQUESTED`)은 신청자 대기라 뺀다.
- [계정 문의]는 ADM-INQ-01을 연다.

## 거래량·거래대금 추이

`GET /admin/dashboard/trade-trend?range=` — 전체 상품의 구간별 거래량(주)·거래대금(P)과 선택 구간 합계. 한 응답에 두 값이 모두 있어 [거래량]/[거래대금] 전환은 다시 호출하지 않는다.

| `range` | 조회 범위 | 단위 `unit` | 구간 수 |
|---|---|---|---|
| `HOUR_1` | 지금이 속한 5분 구간까지 최근 1시간 | `MINUTE_5` | 12 |
| `HOUR_6` | 지금이 속한 30분 구간까지 최근 6시간 | `MINUTE_30` | 12 |
| `DAY_1` | 오늘 00:00 ~ 24:00 | `HOUR_3` | 8 |
| `WEEK_1` | 오늘 포함 최근 7일 | `DAY` | 7 |
| `MONTH_1` | 오늘 포함 최근 30일 | `DAY` | 30 |
| `ALL` | 첫 체결일 ~ 오늘. 체결이 없으면 오늘 | `MONTH` | 달 수 |
| `CUSTOM` | `from` 00:00 ~ `to` 24:00 (YYYY-MM-DD, 둘 다 포함) | 1일 이내 `HOUR`, 31일 이내 `DAY`, 초과 `MONTH` | 구간 수 |

- 응답: `from`(포함)·`to`(포함하지 않음), 화면 표시용 `periodLabel`(예: `2026.09.11 00:00 ~ 24:00`, `2026.09.05 ~ 2026.09.11`), 합계 `totalVolume`·`totalTradeAmount`, 시간순 `buckets[{ time, volume, tradeAmount }]`. 체결이 없는 구간도 0으로 들어간다.
- 월별 구간의 `time`은 그 달 1일 00시이고, 값은 조회 범위 안의 날만 합한다.
- 1일 이내는 분·시간봉을, 일별·월별은 일별 통계를 읽는다. 일별 통계가 아직 없는 날(오늘, 00시 직후의 어제)은 일봉 합계로 채운다.
- `CUSTOM`에서 시작일·종료일이 없거나, 시작일이 종료일보다 늦거나, 종료일이 오늘보다 늦으면 `400 / DASHBOARD_INVALID_PERIOD`. 날짜 형식이 틀리면 `400 / BAD_REQUEST`.

## 일별 통계 배치

- `DailyStatsBatchService`가 서버 시작 시와 10분마다 실행한다. Railway에 별도의 Cron 서비스나 새 환경 변수는 필요 없다. 서버가 실행 중이어야 동작한다.
- 하루 기준은 한국 시간 00시다. 00시가 지나고 1분 뒤부터 전날을 마감으로 본다(자정 직전 체결이 봉에 반영되는 시간).
- 마감한 날마다 `daily_stats`에 한 행을 만든다. 마지막 행 다음 날부터, 행이 없으면 첫 체결일부터 어제까지 채운다. 만든 행은 고치지 않는다. 서버가 꺼져 있던 날도 다음 실행에서 채운다.
- 주별(월요일 시작)·월별 값은 일별 행을 묶어 계산한다.

| 컬럼 | 값 | 밀린 날 |
|---|---|---|
| `trade_volume`, `trade_amount` | 그날 전체 상품 일봉의 거래량·거래대금 합계. 체결이 없으면 0 | 일봉이 남아 있어 정확히 채운다 |
| `listed_stock_count` | 상장 상품 수 (거래 중·거래 중지, 삭제 제외) | `null` |
| `pending_listing_count` | 상장 심사 대기 건수 (`SUBMITTED`·`UNDER_REVIEW`, 삭제 제외) | `null` |
| `pending_inquiry_count` | 계정 문의 대기 건수 (접수·처리 중) | `null` |

- 상장 상품·처리 대기는 상태 변경 이력이 없어 지난 시점 값을 다시 셀 수 없다. 그래서 마감 뒤 첫 실행에서 센 값을 어제 행에만 넣고, 그보다 오래 밀린 날은 `null`로 둔다.
- 집계가 실패하면 로그를 남기고 다음 주기에 다시 시도한다.
