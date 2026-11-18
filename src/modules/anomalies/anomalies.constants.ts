import {
  AnomalyAction,
  AnomalyStatus,
  AnomalyType,
} from '../../generated/prisma/client.js';

/*
 * 탐지 기준값. 설계서(ADM-MON-01)·SRS 61에 기준이 없어 임시로 정했다. 기획 확인 후 이 값만 바꾼다.
 */

/** 비정상 가격 체결: 직전 체결가(첫 체결이면 상장가)에서 이 비율(%)을 넘게 벗어난 체결 */
export const PRICE_DEVIATION_PERCENT = 30n;

/** 대량 주문: 주문 수량이 발행량의 이 비율(%) 이상인 주문 */
export const LARGE_ORDER_PERCENT = 1n;

/** 반복 주문: 같은 회원이 같은 상품에 이 시간(초) 안에 */
export const REPEATED_ORDER_WINDOW_SECONDS = 60;

/** 반복 주문: 이 건수 이상 주문하면 탐지한다 */
export const REPEATED_ORDER_MIN_COUNT = 10;

/** 반복 주문: 같은 회원·상품은 이 시간(분) 안에 다시 남기지 않는다 */
export const REPEATED_ORDER_COOLDOWN_MINUTES = 10;

/** 탐지 오류 코드와 목록에 보여줄 오류 내용 */
export const ANOMALY_ERRORS = {
  LARGE_ORDER: { code: 'LARGE_ORDER', message: '대량 주문 탐지' },
  REPEATED_ORDER: { code: 'REPEATED_ORDER', message: '반복 주문 탐지' },
  PRICE_DEVIATION: { code: 'PRICE_DEVIATION', message: '가격 편차 초과' },
  ORDER_FAILED: { code: 'ORDER_FAILED', message: '주문 처리 실패' },
  LOCKED_CASH_MISMATCH: {
    code: 'LOCKED_CASH_MISMATCH',
    message: '예약 포인트 불일치',
  },
  LOCKED_QTY_MISMATCH: {
    code: 'LOCKED_QTY_MISMATCH',
    message: '예약 수량 불일치',
  },
} as const;

/** 탐지 유형 화면 이름 (활동 이력 대상 이름에 쓴다) */
export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  [AnomalyType.LARGE_ORDER]: '대량 주문',
  [AnomalyType.REPEATED_ORDER]: '반복 주문',
  [AnomalyType.ABNORMAL_PRICE]: '비정상 가격 체결',
  [AnomalyType.ORDER_FAILURE]: '주문 처리 실패',
  [AnomalyType.BALANCE_MISMATCH]: '잔액 불일치',
};

/** 처리 상태 화면 이름 */
export const ANOMALY_STATUS_LABELS: Record<AnomalyStatus, string> = {
  [AnomalyStatus.PENDING]: '미처리',
  [AnomalyStatus.REVIEWING]: '확인중',
  [AnomalyStatus.RESOLVED]: '처리완료',
};

/** 조치 유형 화면 이름 */
export const ANOMALY_ACTION_LABELS: Record<AnomalyAction, string> = {
  [AnomalyAction.STOCK_PAUSE]: '상품 거래 중지',
  [AnomalyAction.USER_BLOCK]: '회원 정지',
  [AnomalyAction.NO_ISSUE]: '이상 없음',
};

/** 목록 한 페이지 기본 건수 */
export const ANOMALY_PAGE_SIZE = 20;

/** 목록 한 페이지 최대 건수 */
export const ANOMALY_MAX_PAGE_SIZE = 100;

/** 발생 기간으로 조회할 수 있는 최대 일수 */
export const ANOMALY_MAX_PERIOD_DAYS = 365;
