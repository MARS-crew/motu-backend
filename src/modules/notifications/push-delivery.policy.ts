export const PUSH_NIGHT_WINDOW = {
  timeZone: 'Asia/Seoul',
  nightStart: '21:00',
  nightEnd: '08:00',
} as const;

export type PushDeliveryReason =
  | 'ALLOWED'
  | 'PUSH_DISABLED'
  | 'NIGHT_PUSH_DISABLED'
  | 'USER_UNAVAILABLE'
  | 'INVALID_TIME';
export interface PushDeliveryDecision {
  allowed: boolean;
  reason: PushDeliveryReason;
}
export interface PushPreferences {
  isPushEnabled: boolean;
  nightPushEnabled: boolean;
}
const kstHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: PUSH_NIGHT_WINDOW.timeZone,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** 실제 발송 시각으로 판단한다. 앱 내 알림 생성 여부나 기기 권한을 결정하지 않는다. */
export function evaluatePushDelivery(
  preferences: PushPreferences,
  at: Date,
): PushDeliveryDecision {
  if (!preferences.isPushEnabled) {
    return { allowed: false, reason: 'PUSH_DISABLED' };
  }
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    return { allowed: false, reason: 'INVALID_TIME' };
  }
  const hour = Number(kstHour.format(at));
  if ((hour >= 21 || hour < 8) && !preferences.nightPushEnabled) {
    return { allowed: false, reason: 'NIGHT_PUSH_DISABLED' };
  }
  return { allowed: true, reason: 'ALLOWED' };
}
