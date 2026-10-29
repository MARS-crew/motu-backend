/** 거래내역·체결주문·미체결주문 한 페이지 기본 건수 */
export const TRADE_HISTORY_PAGE_SIZE = 10;

/** 거래내역·체결주문 정렬 */
export enum TradeHistorySort {
  /** 최신순 (기본) */
  LATEST = 'LATEST',
  /** 금액 큰 순 */
  AMOUNT = 'AMOUNT',
  /** 상품명순 */
  STOCK_NAME = 'STOCK_NAME',
}

/** 미체결주문 정렬 */
export enum OpenOrderSort {
  /** 최신순 (기본) */
  LATEST = 'LATEST',
  /** 주문 금액 큰 순 */
  AMOUNT = 'AMOUNT',
}
