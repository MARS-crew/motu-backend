import {
  AnomalyStatus,
  InquiryStatus,
  ListingApplicationStatus,
  TradeStatus,
} from '../../generated/prisma/client.js';

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
/** 처리 대기로 세는 상장 신청 상태. 보완 요청(REVISION_REQUESTED)은 신청자 대기라 뺀다. */
export const PENDING_LISTING_STATUSES: ListingApplicationStatus[] = [
  ListingApplicationStatus.SUBMITTED,
  ListingApplicationStatus.UNDER_REVIEW,
];
/** 처리 대기로 세는 계정 문의 상태 */
export const PENDING_INQUIRY_STATUSES: InquiryStatus[] = [
  InquiryStatus.SUBMITTED,
  InquiryStatus.IN_PROGRESS,
];

/** 미처리로 세는 이상 거래 상태 (미처리·확인중) */
export const PENDING_ANOMALY_STATUSES: AnomalyStatus[] = [
  AnomalyStatus.PENDING,
  AnomalyStatus.REVIEWING,
];

/** 거래 추이 조회 기간 (화면의 기간 버튼) */
export enum TradeTrendRange {
  /** 최근 1시간 */
  HOUR_1 = 'HOUR_1',
  /** 최근 6시간 */
  HOUR_6 = 'HOUR_6',
  /** 오늘 00:00 ~ 24:00 */
  DAY_1 = 'DAY_1',
  /** 오늘 포함 최근 7일 */
  WEEK_1 = 'WEEK_1',
  /** 오늘 포함 최근 30일 */
  MONTH_1 = 'MONTH_1',
  /** 첫 체결일부터 오늘까지 */
  ALL = 'ALL',
  /** 직접 설정 (from ~ to) */
  CUSTOM = 'CUSTOM',
}

/** 거래 추이 집계 단위 */
export enum TradeTrendUnit {
  MINUTE_5 = 'MINUTE_5',
  MINUTE_30 = 'MINUTE_30',
  HOUR = 'HOUR',
  HOUR_3 = 'HOUR_3',
  DAY = 'DAY',
  MONTH = 'MONTH',
}

/** 직접 설정에서 시간별로 보여주는 최대 일수 */
export const CUSTOM_HOURLY_MAX_DAYS = 1;
/** 직접 설정에서 일별로 보여주는 최대 일수. 넘으면 월별이다. */
export const CUSTOM_DAILY_MAX_DAYS = 31;
