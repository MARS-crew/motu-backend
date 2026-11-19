import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  ChartInterval,
  ListingApplicationStatus,
} from '../../generated/prisma/client.js';
import { candleStartOf } from '../charts/candle-time.js';
import {
  DAILY_STATS_SETTLE_MS,
  DAY_MS,
  KST_OFFSET_MS,
  LISTED_TRADE_STATUSES,
  PENDING_INQUIRY_STATUSES,
} from './dashboard.constants.js';

/** 이력이 남지 않아 지금 값만 셀 수 있는 대시보드 건수 */
export interface BacklogCounts {
  listedStockCount: number;
  pendingListingCount: number;
  pendingInquiryCount: number;
}

@Injectable()
export class DailyStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 마감한 날 중 행이 없는 날을 만든다. 마지막 행 다음 날부터, 행이 하나도 없으면 첫 체결일부터 어제까지다.
   * 거래량·거래대금은 일봉 합계라 지난 날도 정확하다. 상장 상품·처리 대기는 지금 값만 알 수 있어 어제 행에만 넣는다.
   * @returns 만든 행 수
   */
  async collectClosedDays(now: Date = new Date()): Promise<number> {
    const lastClosed = new Date(
      candleStartOf(
        new Date(now.getTime() - DAILY_STATS_SETTLE_MS),
        ChartInterval.DAY,
      ).getTime() - DAY_MS,
    );
    const first = await this.findFirstDay(lastClosed);
    if (first > lastClosed) {
      return 0;
    }

    const [candles, counts] = await Promise.all([
      this.prisma.chart.groupBy({
        by: ['candleTime'],
        where: {
          interval: ChartInterval.DAY,
          candleTime: { gte: first, lte: lastClosed },
        },
        _sum: { volume: true, tradeAmount: true },
      }),
      this.countBacklog(),
    ]);
    const sums = new Map(
      candles.map(({ candleTime, _sum }) => [candleTime.getTime(), _sum]),
    );

    const rows = [];
    for (
      let day = first.getTime();
      day <= lastClosed.getTime();
      day += DAY_MS
    ) {
      const sum = sums.get(day);
      const isLastClosed = day === lastClosed.getTime();
      rows.push({
        statDate: toStatDate(new Date(day)),
        tradeVolume: sum?.volume ?? 0n,
        tradeAmount: sum?.tradeAmount ?? 0n,
        listedStockCount: isLastClosed ? counts.listedStockCount : null,
        pendingListingCount: isLastClosed ? counts.pendingListingCount : null,
        pendingInquiryCount: isLastClosed ? counts.pendingInquiryCount : null,
      });
    }
    const { count } = await this.prisma.dailyStat.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * 상장 상품(거래 중·거래 중지), 상장 심사 대기(SUBMITTED), 계정 문의 대기(접수·처리 중)의 지금 건수.
   */
  async countBacklog(): Promise<BacklogCounts> {
    const [listedStockCount, pendingListingCount, pendingInquiryCount] =
      await Promise.all([
        this.prisma.stock.count({
          where: {
            isDeleted: false,
            tradeStatus: { in: LISTED_TRADE_STATUSES },
          },
        }),
        this.prisma.listingApplication.count({
          where: {
            status: ListingApplicationStatus.SUBMITTED,
            deletedDate: null,
          },
        }),
        this.prisma.inquiry.count({
          where: { status: { in: PENDING_INQUIRY_STATUSES } },
        }),
      ]);
    return { listedStockCount, pendingListingCount, pendingInquiryCount };
  }

  /**
   * 이번에 만들 첫날의 시작 시각. 마지막 행 다음 날이고, 행이 없으면 첫 일봉 날이다.
   * 행이 없으면 첫 체결이 오늘이거나 체결이 없어도 어제(lastClosed) 행은 만든다.
   */
  private async findFirstDay(lastClosed: Date): Promise<Date> {
    const latest = await this.prisma.dailyStat.findFirst({
      orderBy: { statDate: 'desc' },
      select: { statDate: true },
    });
    if (latest) {
      return new Date(fromStatDate(latest.statDate).getTime() + DAY_MS);
    }
    const firstCandle = await this.prisma.chart.findFirst({
      where: { interval: ChartInterval.DAY },
      orderBy: { candleTime: 'asc' },
      select: { candleTime: true },
    });
    return firstCandle && firstCandle.candleTime < lastClosed
      ? firstCandle.candleTime
      : lastClosed;
  }
}

/** 한국 시간 하루의 시작 시각을 날짜 컬럼 값(UTC 00시)으로 바꾼다. */
export function toStatDate(dayStart: Date): Date {
  return new Date(dayStart.getTime() + KST_OFFSET_MS);
}

/** 날짜 컬럼 값(UTC 00시)을 한국 시간 하루의 시작 시각으로 바꾼다. */
export function fromStatDate(statDate: Date): Date {
  return new Date(statDate.getTime() - KST_OFFSET_MS);
}
