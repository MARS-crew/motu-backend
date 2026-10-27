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

/**
 * 주문 하나가 한 번에 체결할 수 있는 호가창 주문 수.
 * 체결 1건마다 쿼리가 약 10개씩 늘어 트랜잭션이 길어지므로, 넘으면 주문을 거부하고 나눠 주문하도록 안내한다.
 */
export const MAX_FILLS_PER_ORDER = 100;

/**
 * 주문·취소·상장·거래 종료 트랜잭션 제한 (ms). Prisma 기본값은 maxWait 2초, timeout 5초다.
 * 같은 종목의 다음 요청은 큐에서 이 트랜잭션을 기다리므로 timeout을 너무 길게 잡지 않는다.
 */
export const TRADING_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;
