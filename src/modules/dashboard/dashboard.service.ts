import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  ChartInterval,
  Role,
  UserStatus,
} from '../../generated/prisma/client.js';
import { candleStartOf } from '../charts/candle-time.js';
import {
  CUSTOM_DAILY_MAX_DAYS,
  CUSTOM_HOURLY_MAX_DAYS,
  DAY_MS,
  KST_OFFSET_MS,
  PENDING_ANOMALY_STATUSES,
  TradeTrendRange,
  TradeTrendUnit,
} from './dashboard.constants.js';
import { DashboardErrors } from './dashboard.errors.js';
import {
  DailyStatsService,
  fromStatDate,
  toStatDate,
} from './daily-stats.service.js';
import { GetTradeTrendReqDto } from './dto/req/get-trade-trend-req.dto.js';
import { GetDashboardKpisResDto } from './dto/res/get-dashboard-kpis-res.dto.js';
import {
  GetTradeTrendResDto,
  TradeTrendBucketResDto,
} from './dto/res/get-trade-trend-res.dto.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** 고정 길이 단위의 길이와 읽을 봉 */
const FIXED_UNITS: Partial<
  Record<TradeTrendUnit, { ms: number; interval: ChartInterval }>
> = {
  [TradeTrendUnit.MINUTE_5]: {
    ms: 5 * MINUTE_MS,
    interval: ChartInterval.MINUTE,
  },
  [TradeTrendUnit.MINUTE_30]: {
    ms: 30 * MINUTE_MS,
    interval: ChartInterval.MINUTE,
  },
  [TradeTrendUnit.HOUR]: { ms: HOUR_MS, interval: ChartInterval.HOUR },
  [TradeTrendUnit.HOUR_3]: { ms: 3 * HOUR_MS, interval: ChartInterval.HOUR },
};

/** 구간 합계 */
interface Totals {
  volume: bigint;
  tradeAmount: bigint;
}

/** 거래 추이 조회 범위. end는 포함하지 않는다. */
interface TrendPeriod {
  start: Date;
  end: Date;
  unit: TradeTrendUnit;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyStats: DailyStatsService,
  ) {}

  /**
   * 운영 대시보드 상단 카드. 지금 값을 세고 한국 시간 어제 마감 값과 비교한다.
   * 회원은 가입·탈퇴 시각으로 어제 값을 세고, 상장 상품·처리 대기·미처리 이상 거래는 일별 통계의 어제 행과 비교한다.
   */
  async getKpis(now: Date = new Date()): Promise<GetDashboardKpisResDto> {
    const todayStart = candleStartOf(now, ChartInterval.DAY);
    const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

    const [userCount, prevUserCount, backlog, anomalyCount, yesterday] =
      await Promise.all([
        this.prisma.user.count({
          where: { role: Role.USER, userStatus: { not: UserStatus.WITHDRAWN } },
        }),
        // 어제 마감 회원: 오늘 00시 전에 가입했고, 그때 탈퇴하지 않은 회원
        this.prisma.user.count({
          where: {
            role: Role.USER,
            createDate: { lt: todayStart },
            OR: [{ deletedDate: null }, { deletedDate: { gte: todayStart } }],
          },
        }),
        this.dailyStats.countBacklog(),
        this.prisma.anomaly.count({
          where: { status: { in: PENDING_ANOMALY_STATUSES } },
        }),
        this.prisma.dailyStat.findUnique({
          where: { statDate: toStatDate(yesterdayStart) },
        }),
      ]);

    const pendingCount =
      backlog.pendingListingCount + backlog.pendingInquiryCount;
    const prevPendingCount =
      yesterday?.pendingListingCount != null &&
      yesterday.pendingInquiryCount != null
        ? yesterday.pendingListingCount + yesterday.pendingInquiryCount
        : null;

    return {
      userCount,
      userChangeRate:
        prevUserCount > 0
          ? Math.round(
              ((userCount - prevUserCount) / prevUserCount) * 100 * 100,
            ) / 100
          : null,
      listedStockCount: backlog.listedStockCount,
      listedStockChange:
        yesterday?.listedStockCount != null
          ? backlog.listedStockCount - yesterday.listedStockCount
          : null,
      pendingCount,
      pendingListingCount: backlog.pendingListingCount,
      pendingInquiryCount: backlog.pendingInquiryCount,
      pendingChange:
        prevPendingCount !== null ? pendingCount - prevPendingCount : null,
      anomalyCount,
      anomalyChange:
        yesterday?.pendingAnomalyCount != null
          ? anomalyCount - yesterday.pendingAnomalyCount
          : null,
    };
  }

  /**
   * 전체 상품의 거래량·거래대금 추이. 구간 경계는 한국 시간이다.
   * 1일 이내는 분·시간 봉을 묶고, 일별·월별은 일별 통계를 묶는다. 일별 통계가 아직 없는 날(오늘 등)은 일봉을 읽는다.
   */
  async getTradeTrend(
    query: GetTradeTrendReqDto,
    now: Date = new Date(),
  ): Promise<GetTradeTrendResDto> {
    const period = await this.trendPeriodOf(query, now);
    const buckets = await this.sumBuckets(period);

    return {
      range: query.range,
      unit: period.unit,
      from: period.start,
      to: period.end,
      periodLabel: periodLabelOf(period.start, period.end),
      totalVolume: buckets.reduce((sum, { volume }) => sum + volume, 0),
      totalTradeAmount: buckets.reduce(
        (sum, { tradeAmount }) => sum + tradeAmount,
        0,
      ),
      buckets,
    };
  }

  /**
   * 기간 버튼의 조회 범위와 단위. 1시간·6시간은 지금이 속한 구간까지 거꾸로, 나머지는 한국 날짜 단위다.
   */
  private async trendPeriodOf(
    query: GetTradeTrendReqDto,
    now: Date,
  ): Promise<TrendPeriod> {
    const todayStart = candleStartOf(now, ChartInterval.DAY).getTime();
    const tomorrowStart = new Date(todayStart + DAY_MS);
    const recent = (unit: TradeTrendUnit, length: number): TrendPeriod => {
      const unitMs = FIXED_UNITS[unit]!.ms;
      // 30분 단위까지는 한국 시간과 UTC의 경계가 같다.
      const end = now.getTime() - (now.getTime() % unitMs) + unitMs;
      return { start: new Date(end - length), end: new Date(end), unit };
    };
    const lastDays = (days: number): TrendPeriod => ({
      start: new Date(todayStart - (days - 1) * DAY_MS),
      end: tomorrowStart,
      unit: TradeTrendUnit.DAY,
    });

    switch (query.range) {
      case TradeTrendRange.HOUR_1:
        return recent(TradeTrendUnit.MINUTE_5, HOUR_MS);
      case TradeTrendRange.HOUR_6:
        return recent(TradeTrendUnit.MINUTE_30, 6 * HOUR_MS);
      case TradeTrendRange.DAY_1:
        return {
          start: new Date(todayStart),
          end: tomorrowStart,
          unit: TradeTrendUnit.HOUR_3,
        };
      case TradeTrendRange.WEEK_1:
        return lastDays(7);
      case TradeTrendRange.MONTH_1:
        return lastDays(30);
      case TradeTrendRange.ALL: {
        const first = await this.findFirstTradeDay();
        return {
          start: first ?? new Date(todayStart),
          end: tomorrowStart,
          unit: TradeTrendUnit.MONTH,
        };
      }
      case TradeTrendRange.CUSTOM: {
        if (!query.from || !query.to || query.from > query.to) {
          throw new BusinessException(DashboardErrors.INVALID_PERIOD);
        }
        let start = new Date(`${query.from}T00:00:00+09:00`);
        const end = new Date(
          new Date(`${query.to}T00:00:00+09:00`).getTime() + DAY_MS,
        );
        if (end > tomorrowStart) {
          throw new BusinessException(DashboardErrors.INVALID_PERIOD);
        }
        const days = (end.getTime() - start.getTime()) / DAY_MS;
        const unit =
          days <= CUSTOM_HOURLY_MAX_DAYS
            ? TradeTrendUnit.HOUR
            : days <= CUSTOM_DAILY_MAX_DAYS
              ? TradeTrendUnit.DAY
              : TradeTrendUnit.MONTH;
        if (unit === TradeTrendUnit.MONTH) {
          // 체결 전 날짜까지 하루씩 돌지 않도록 시작일을 첫 체결일로 자른다. 기간 전체가 체결 전이면 마지막 날만 남긴다.
          const lastDay = end.getTime() - DAY_MS;
          const floor = Math.min(
            (await this.findFirstTradeDay())?.getTime() ?? lastDay,
            lastDay,
          );
          if (start.getTime() < floor) {
            start = new Date(floor);
          }
        }
        return { start, end, unit };
      }
    }
  }

  /** 첫 일봉의 날(한국 시간 00시). 체결이 없으면 null */
  private async findFirstTradeDay(): Promise<Date | null> {
    const first = await this.prisma.chart.findFirst({
      where: { interval: ChartInterval.DAY },
      orderBy: { candleTime: 'asc' },
      select: { candleTime: true },
    });
    return first?.candleTime ?? null;
  }

  /** 범위를 단위 구간으로 나눠 구간마다 합한다. 체결이 없는 구간도 0으로 넣는다. */
  private async sumBuckets(
    period: TrendPeriod,
  ): Promise<TradeTrendBucketResDto[]> {
    const { start, end, unit } = period;
    const fixed = FIXED_UNITS[unit];
    const sums = new Map<number, Totals>();
    const add = (key: number, totals: Totals) => {
      const current = sums.get(key);
      sums.set(key, {
        volume: (current?.volume ?? 0n) + totals.volume,
        tradeAmount: (current?.tradeAmount ?? 0n) + totals.tradeAmount,
      });
    };

    let keys: number[];
    if (fixed) {
      const candles = await this.prisma.chart.groupBy({
        by: ['candleTime'],
        where: {
          interval: fixed.interval,
          candleTime: { gte: start, lt: end },
        },
        _sum: { volume: true, tradeAmount: true },
      });
      for (const { candleTime, _sum } of candles) {
        const offset = candleTime.getTime() - start.getTime();
        add(start.getTime() + offset - (offset % fixed.ms), toTotals(_sum));
      }
      keys = [];
      for (let t = start.getTime(); t < end.getTime(); t += fixed.ms) {
        keys.push(t);
      }
    } else {
      const daily = await this.dailyTotals(start, end);
      for (const [day, totals] of daily) {
        add(
          unit === TradeTrendUnit.MONTH
            ? candleStartOf(new Date(day), ChartInterval.MONTH).getTime()
            : day,
          totals,
        );
      }
      keys =
        unit === TradeTrendUnit.MONTH
          ? monthStartsOf(start, end)
          : [...daily.keys()];
    }

    return keys.map((key) => {
      const totals = sums.get(key);
      return {
        time: new Date(key),
        volume: Number(totals?.volume ?? 0n),
        tradeAmount: Number(totals?.tradeAmount ?? 0n),
      };
    });
  }

  /**
   * 날짜별(한국 시간 00시) 거래량·거래대금. 일별 통계를 먼저 읽고, 행이 없는 날만 일봉 합계로 채운다.
   * 돌려주는 Map은 start부터 하루씩 모든 날을 담는다.
   */
  private async dailyTotals(
    start: Date,
    end: Date,
  ): Promise<Map<number, Totals>> {
    const stats = await this.prisma.dailyStat.findMany({
      where: { statDate: { gte: toStatDate(start), lt: toStatDate(end) } },
      select: { statDate: true, tradeVolume: true, tradeAmount: true },
    });
    const byDay = new Map(
      stats.map((row) => [
        fromStatDate(row.statDate).getTime(),
        { volume: row.tradeVolume, tradeAmount: row.tradeAmount },
      ]),
    );

    const missing: Date[] = [];
    for (let day = start.getTime(); day < end.getTime(); day += DAY_MS) {
      if (!byDay.has(day)) missing.push(new Date(day));
    }
    const candles =
      missing.length > 0
        ? await this.prisma.chart.groupBy({
            by: ['candleTime'],
            where: { interval: ChartInterval.DAY, candleTime: { in: missing } },
            _sum: { volume: true, tradeAmount: true },
          })
        : [];
    const candleByDay = new Map(
      candles.map(({ candleTime, _sum }) => [
        candleTime.getTime(),
        toTotals(_sum),
      ]),
    );

    const totals = new Map<number, Totals>();
    for (let day = start.getTime(); day < end.getTime(); day += DAY_MS) {
      totals.set(
        day,
        byDay.get(day) ??
          candleByDay.get(day) ?? { volume: 0n, tradeAmount: 0n },
      );
    }
    return totals;
  }
}

function toTotals(sum: {
  volume: bigint | null;
  tradeAmount: bigint | null;
}): Totals {
  return { volume: sum.volume ?? 0n, tradeAmount: sum.tradeAmount ?? 0n };
}

/** start가 속한 달부터 end 직전이 속한 달까지 각 달 1일 00시(한국 시간) */
function monthStartsOf(start: Date, end: Date): number[] {
  const months: number[] = [];
  let month = candleStartOf(start, ChartInterval.MONTH).getTime();
  while (month < end.getTime()) {
    months.push(month);
    // 한 달 뒤 날짜가 속한 달의 1일
    month = candleStartOf(
      new Date(month + 32 * DAY_MS),
      ChartInterval.MONTH,
    ).getTime();
  }
  return months;
}

/**
 * 화면에 보여줄 기간 (한국 시간). 하루 안이면 `2026.09.11 00:00 ~ 24:00`,
 * 날짜 단위면 `2026.09.05 ~ 2026.09.11`(종료일 포함), 그 밖에는 시작·끝 일시를 모두 적는다.
 */
export function periodLabelOf(start: Date, end: Date): string {
  const [startDate, startTime] = kstParts(start);
  const [endDate, endTime] = kstParts(end);
  const lastDate = kstParts(new Date(end.getTime() - 1))[0];
  if (startDate === lastDate) {
    return `${startDate} ${startTime} ~ ${endTime === '00:00' ? '24:00' : endTime}`;
  }
  if (startTime === '00:00' && endTime === '00:00') {
    return `${startDate} ~ ${lastDate}`;
  }
  return `${startDate} ${startTime} ~ ${endDate} ${endTime}`;
}

/** 한국 시간 [YYYY.MM.DD, HH:mm] */
function kstParts(time: Date): [string, string] {
  const iso = new Date(time.getTime() + KST_OFFSET_MS).toISOString();
  return [iso.slice(0, 10).replaceAll('-', '.'), iso.slice(11, 16)];
}
