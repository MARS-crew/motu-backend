import {
  AdminActivityAction,
  AdminActivityTarget,
} from '../../generated/prisma/client.js';

/** 작업 대상별로 쓸 수 있는 수행 작업 (설계서 ADM-MON-04) */
export const ACTIONS_BY_TARGET: Record<
  AdminActivityTarget,
  readonly AdminActivityAction[]
> = {
  [AdminActivityTarget.LISTING_APPLICATION]: [
    AdminActivityAction.LISTING_APPROVE,
    AdminActivityAction.LISTING_REVISION_REQUEST,
    AdminActivityAction.LISTING_REJECT,
  ],
  [AdminActivityTarget.STOCK]: [
    AdminActivityAction.STOCK_UPDATE,
    AdminActivityAction.STOCK_PAUSE,
    AdminActivityAction.STOCK_RESUME,
    AdminActivityAction.STOCK_CLOSE,
  ],
  [AdminActivityTarget.USER]: [
    AdminActivityAction.USER_STATUS_CHANGE,
    AdminActivityAction.USER_UNLOCK,
    AdminActivityAction.POINT_GRANT,
    AdminActivityAction.POINT_RECALL,
  ],
  [AdminActivityTarget.ADMIN]: [
    AdminActivityAction.ADMIN_CREATE,
    AdminActivityAction.ADMIN_STATUS_CHANGE,
  ],
  [AdminActivityTarget.NOTICE]: [
    AdminActivityAction.NOTICE_PUBLISH,
    AdminActivityAction.NOTICE_HIDE,
    AdminActivityAction.NOTICE_DELETE,
  ],
  [AdminActivityTarget.ANOMALY]: [AdminActivityAction.ANOMALY_ACTION],
};

export const ADMIN_ACTIVITY_LOG_PAGE_SIZE = 20;
export const ADMIN_ACTIVITY_LOG_MAX_PAGE_SIZE = 100;
/** 작업 기간 조회 최대 길이 (직접 설정) */
export const ADMIN_ACTIVITY_LOG_MAX_PERIOD_DAYS = 366;
