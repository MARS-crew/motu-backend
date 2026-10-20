/** 회원가입 시 한 번 지급하는 초기 포인트. 포인트 리셋도 이 금액으로 재설정한다. */
export const INITIAL_CASH = 3_000_000n;

/** 추가 포인트 1회 지급액 */
export const POINT_GRANT_AMOUNT = 100_000n;
/** 추가 포인트를 다시 받을 수 있는 간격 (마지막 지급 시각 기준) */
export const POINT_GRANT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 보유 포인트가 이 금액 미만이어야 리셋할 수 있다. (초기 포인트의 10%) */
export const POINT_RESET_MAX_CASH = INITIAL_CASH / 10n;
/** 포인트를 다시 리셋할 수 있는 간격 (마지막 리셋 시각 기준) */
export const POINT_RESET_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** 포인트 이력 한 페이지 기본 건수 */
export const LEDGER_PAGE_SIZE = 20;

/** 관리자가 초기화할 수 있는 대기시간 종류 */
export enum PointCooldownType {
  GRANT = 'grant',
  RESET = 'reset',
}
