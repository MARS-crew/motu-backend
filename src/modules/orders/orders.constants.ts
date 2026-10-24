/**
 * 수수료율 (bp, 1bp = 0.01%). 0.15%면 15n이다.
 * 매수 예약 포인트, 체결 정산, 주문 가능 정보가 모두 이 값을 쓴다.
 */
export const FEE_RATE_BPS = 0n;

/** bp를 비율로 바꿀 때 나누는 값 */
export const BPS_DENOMINATOR = 10_000n;
