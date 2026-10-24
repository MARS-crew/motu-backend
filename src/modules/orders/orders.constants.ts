/**
 * 수수료율 (bp, 1bp = 0.01%). 0.02%면 2n이다.
 * 매수 예약 포인트, 체결 정산, 주문 가능 정보가 모두 이 값을 쓴다.
 */
export const FEE_RATE_BPS = 2n;

/** bp를 비율로 바꿀 때 나누는 값 */
export const BPS_DENOMINATOR = 10_000n;

/** 내 주문 목록 필터 */
export enum OrderListStatus {
  /** 미체결 (접수, 일부 체결) */
  OPEN = 'OPEN',
  /** 완료 (전부 체결, 취소) */
  DONE = 'DONE',
  /** 전체 */
  ALL = 'ALL',
}

/** 호가 조회에서 보여주는 가격 단계 수 */
export const ORDER_BOOK_DEPTH = 5;
