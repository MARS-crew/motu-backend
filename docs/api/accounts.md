# 계좌·포인트

[← API 명세서 목차](README.md)

화면 USR-ASSET-01, 02-01, 02-02. 사용자 API는 모두 **로그인 필요**이고, [관리자 API](#관리자-계좌-관리)는 관리자 토큰이 필요합니다.

## 내 계좌 (자산관리)

| 항목 | 내용 |
|------|------|
| 화면 | USR-ASSET-01 |
| API | `GET /api/accounts/me` |
| 응답 | `cash`(보유 포인트 = 예수금, 주문 예약분 포함), `lockedCash`(매수 주문에 예약된 포인트), `availableCash`(사용 가능 포인트 = `cash - lockedCash`) |

- 자산관리 화면의 "보유 포인트"에는 `cash`를 표시합니다. (기획 확인)
- 매수 주문 화면의 "사용 가능 포인트"에는 `availableCash`를 씁니다.

## 포인트 변경 이력

| 항목 | 내용 |
|------|------|
| API | `GET /api/accounts/me/ledgers?page=&size=` |
| 페이지 | 페이지 번호 방식. `page` 1부터, `size` 기본 20, 최대 100 |
| 응답 | `items[] { ledgerId, type, amount, balanceBefore, balanceAfter, createDate }`, `page`, `size`, `totalCount` |

| `type` | 뜻 |
|------|------|
| `DEPOSIT` | 초기 지급 (회원가입) |
| `GRANT` | 추가 포인트 지급 |
| `RESET` | 포인트 리셋 |
| `ADJUST` | 관리자 조정 |
| `BUY` / `SELL` | 매수 / 매도 (주문 작업 후) |

## 추가 포인트 지급

| 항목 | 내용 |
|------|------|
| 화면 | USR-ASSET-02-01 |

| 단계 | API | 응답 |
|------|------|------|
| 지급 가능 여부 | `GET /api/accounts/me/point-grant` | `cash`, `amount`(100,000), `available`, `nextAvailableAt`(지금 가능하면 null), `remainingSeconds`(지금 가능하면 0), `lastGrantedAt` |
| 지급 | `POST /api/accounts/me/point-grant` | `amount`, `cashBefore`, `cashAfter`, `grantedAt`, `nextAvailableAt` |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `POINT_GRANT_TOO_SOON` + `details { nextAvailableAt }` | 마지막 지급 후 24시간 전 | 버튼 비활성화, "남은 시간 n시간 n분" |
| 409 `ACCOUNT_CONCURRENT_UPDATE` | 동시에 여러 번 눌림 | 상태를 다시 조회. **요청 중에는 버튼을 비활성화해 주세요.** |

- 화면 진입 시 `GET`으로 상태를 받아 버튼 활성화와 남은 시간을 정합니다.
- 남은 시간은 `remainingSeconds`(서버 시각 기준)로 계산하면 기기 시계가 틀려도 맞게 나옵니다.
- 리셋해도 24시간 대기는 유지됩니다.

## 포인트 리셋

| 항목 | 내용 |
|------|------|
| 화면 | USR-ASSET-02-02 |

| 단계 | API | 응답 |
|------|------|------|
| 리셋 가능 여부 | `GET /api/accounts/me/point-reset` | `resetCash`(3,000,000), `cash`, `available`, `reason`(리셋 불가 사유, 가능하면 null), `conditions[] { condition, met }`, `nextAvailableAt`, `remainingSeconds` |
| 리셋 | `POST /api/accounts/me/point-reset` | `cashBefore`, `cashAfter`, `resetAt`, `nextAvailableAt` |

리셋 조건 (화면 순서, 모두 충족해야 함)

| `condition` | 조건 | 불가 사유 (`reason`) |
|------|------|------|
| (보유 종목 테이블 생기면 추가) | 보유 종목 0개 | 현재 보유 중인 종목이 존재해 리셋이 불가능합니다. |
| `NO_LOCKED_CASH` | 미체결 주문 없음 (= 예약 포인트 0P = 처리 중 거래 없음) | 현재 미체결 주문이 존재해 리셋이 불가능합니다. |
| `CASH_BELOW_LIMIT` | 보유 포인트 300,000P 미만 | 보유 포인트가 리셋 가능 기준(300,000P) 이상입니다. |
| `RESET_INTERVAL_PASSED` | 마지막 리셋 후 7일 경과 (리셋한 적 없으면 충족) | 마지막 리셋으로부터 7일이 지난 후 다시 시도해 주세요. |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 409 `POINT_RESET_NOT_ALLOWED` + `details { conditions }` | 조건 미충족 | `message`(첫 번째 사유) 표시 |
| 409 `ACCOUNT_CONCURRENT_UPDATE` | 동시에 여러 번 눌림 | 상태를 다시 조회 |

- 사유는 충족하지 못한 조건 중 화면 순서상 **첫 번째 하나**만 내려줍니다.
- 7일 조건에는 프론트가 `remainingSeconds`로 "n일 n시간 nn분"을 붙여 표시합니다.
- 리셋 전 확인 모달(복구 불가 안내)은 프론트에서 띄웁니다.
- 리셋하면 거래내역은 삭제되고(주문 작업 후), 관심상품과 포인트 이력은 유지됩니다.

---

## 관리자 계좌 관리

모두 **관리자** 토큰이 필요합니다. 테스트 계정은 `motuadmin`입니다. 관리자 화면은 2차 개발 예정이고, 지금은 테스트용으로 씁니다.

| 기능 | API | 요청 | 응답 |
|------|------|------|------|
| 회원 계좌 조회 | `GET /api/admin/accounts/:userId` | | `userId`, `cash`, `lockedCash`, `availableCash`, `lastPointGrantAt`, `lastPointResetAt` |
| 회원 포인트 이력 | `GET /api/admin/accounts/:userId/ledgers?page=&size=` | | [포인트 변경 이력](#포인트-변경-이력)과 같음 |
| 포인트 지급·차감 | `PATCH /api/admin/accounts/:userId/cash` | `amount` (양수 지급, 음수 차감, ±100,000,000 이내, 0 불가) | `amount`, `cashBefore`, `cashAfter` |
| 대기시간 초기화 | `DELETE /api/admin/accounts/:userId/cooldowns/:type` | `type`: `grant`(24시간) / `reset`(7일) | 204 |

| 에러 | 상황 |
|------|------|
| 404 `ACCOUNT_NOT_FOUND` | 없는 회원 |
| 400 `ACCOUNT_INSUFFICIENT_CASH` | 사용 가능 포인트보다 많이 차감 |
| 403 `AUTH_FORBIDDEN` | 관리자가 아님 |

- 리셋을 테스트하려면 포인트를 300,000P 미만으로 차감한 뒤 리셋을 호출합니다.
