import { InquiryStatus, TradeStatus } from '../../generated/prisma/client.js';

/** 한국 시간(UTC+9). 서머타임이 없어 항상 같다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 일별 통계 배치 확인 주기 */
export const DAILY_STATS_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** 자정 직전 체결이 봉에 반영되도록, 00시가 지나고 이만큼 기다린 뒤 전날을 마감으로 본다. */
export const DAILY_STATS_SETTLE_MS = 60 * 1000;

/** 상장 상품으로 세는 거래 상태 */
export const LISTED_TRADE_STATUSES: TradeStatus[] = [
  TradeStatus.ACTIVE,
  TradeStatus.PAUSED,
];
/** 처리 대기로 세는 계정 문의 상태 */
export const PENDING_INQUIRY_STATUSES: InquiryStatus[] = [
  InquiryStatus.SUBMITTED,
  InquiryStatus.IN_PROGRESS,
];
