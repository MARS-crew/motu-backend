/** 상장 후 이 기간 동안 신규 상장 목록에 New 배지를 표시한다. */
export const NEW_LISTING_BADGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 검색어 최대 길이 */
export const MAX_SEARCH_KEYWORD_LENGTH = 50;

export enum StockSort {
  /** 거래대금 많은순 (기본) */
  TRADE_AMOUNT = 'TRADE_AMOUNT',
  /** 등락률 높은순 */
  CHANGE_RATE_DESC = 'CHANGE_RATE_DESC',
  /** 등락률 낮은순 */
  CHANGE_RATE_ASC = 'CHANGE_RATE_ASC',
  /** 거래량 많은순 */
  VOLUME = 'VOLUME',
  /** 최근 상장순 */
  LISTING_DATE = 'LISTING_DATE',
}
