import { ChartInterval } from '../../generated/prisma/client.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** 한국 시간(UTC+9). 서머타임이 없어 항상 같다. */
const KST_OFFSET_MS = 9 * HOUR_MS;

/**
 * 시각이 속한 봉의 시작 시각. 일·주(월요일)·월 봉의 경계는 한국 시간 00시다.
 * 돌려주는 값은 그 시작 시각의 실제 시점(Date)이다.
 */
export function candleStartOf(time: Date, interval: ChartInterval): Date {
  const ms = time.getTime();
  switch (interval) {
    case ChartInterval.MINUTE:
      return new Date(ms - (ms % MINUTE_MS));
    case ChartInterval.HOUR:
      // 한국 시간은 UTC와 정확히 9시간 차이라 시간 경계가 UTC와 같다.
      return new Date(ms - (ms % HOUR_MS));
    case ChartInterval.DAY:
      return fromKst(kstDayStart(ms));
    case ChartInterval.WEEK: {
      const dayStart = kstDayStart(ms);
      // getUTCDay: 일요일 0 ~ 토요일 6. 월요일부터 지난 날 수
      const daysSinceMonday = (new Date(dayStart).getUTCDay() + 6) % 7;
      return fromKst(dayStart - daysSinceMonday * DAY_MS);
    }
    case ChartInterval.MONTH: {
      const kst = new Date(ms + KST_OFFSET_MS);
      return fromKst(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1));
    }
  }
}

/** 한국 시간으로 본 그날 00시를, 한국 시간 벽시계 값(UTC 필드로 표현)으로 돌려준다. */
function kstDayStart(ms: number): number {
  const kstMs = ms + KST_OFFSET_MS;
  return kstMs - (kstMs % DAY_MS);
}

/** 한국 시간 벽시계 값을 실제 시점으로 바꾼다. */
function fromKst(kstMs: number): Date {
  return new Date(kstMs - KST_OFFSET_MS);
}
