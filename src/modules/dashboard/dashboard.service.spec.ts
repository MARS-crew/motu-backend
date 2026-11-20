import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AnomalyStatus,
  ChartInterval,
  Role,
  UserStatus,
} from '../../generated/prisma/client.js';
import { TradeTrendRange, TradeTrendUnit } from './dashboard.constants.js';
import { DashboardErrors } from './dashboard.errors.js';
import { DashboardService, periodLabelOf } from './dashboard.service.js';
import type { DailyStatsService } from './daily-stats.service.js';
import { GetTradeTrendReqDto } from './dto/req/get-trade-trend-req.dto.js';

describe('DashboardService', () => {
  const user = { count: vi.fn() };
  const anomaly = { count: vi.fn() };
  const dailyStat = { findUnique: vi.fn(), findMany: vi.fn() };
  const chart = { findFirst: vi.fn(), groupBy: vi.fn() };
  const prisma = {
    user,
    anomaly,
    dailyStat,
    chart,
  } as unknown as PrismaService;
  const dailyStats = { countBacklog: vi.fn() };
  const service = new DashboardService(
    prisma,
    dailyStats as unknown as DailyStatsService,
  );

  /** 한국 시간 일시 */
  const kst = (time: string) => new Date(`${time}+09:00`);
  /** 날짜 컬럼 값 */
  const statDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
  const NOW = kst('2026-11-19T17:02:30');
  const queryOf = (overrides: Partial<GetTradeTrendReqDto>) =>
    Object.assign(new GetTradeTrendReqDto(), overrides);
  const sumOf = (volume: bigint, tradeAmount: bigint) => ({
    _sum: { volume, tradeAmount },
  });

  beforeEach(() => {
    vi.resetAllMocks();
    chart.groupBy.mockResolvedValue([]);
    dailyStat.findMany.mockResolvedValue([]);
  });

  describe('getKpis', () => {
    beforeEach(() => {
      user.count.mockResolvedValueOnce(12_480).mockResolvedValueOnce(12_223);
      anomaly.count.mockResolvedValue(3);
      dailyStats.countBacklog.mockResolvedValue({
        listedStockCount: 36,
        pendingListingCount: 5,
        pendingInquiryCount: 3,
      });
    });

    it('지금 값을 세고 어제 마감 값과 비교한다', async () => {
      dailyStat.findUnique.mockResolvedValue({
        listedStockCount: 33,
        pendingListingCount: 4,
        pendingInquiryCount: 2,
        pendingAnomalyCount: 2,
      });

      await expect(service.getKpis(NOW)).resolves.toEqual({
        userCount: 12_480,
        userChangeRate: 2.1,
        listedStockCount: 36,
        listedStockChange: 3,
        pendingCount: 8,
        pendingListingCount: 5,
        pendingInquiryCount: 3,
        pendingChange: 2,
        anomalyCount: 3,
        anomalyChange: 1,
      });
      const todayStart = kst('2026-11-19T00:00:00');
      // 탈퇴 회원은 빼고, 어제 값은 오늘 00시 전에 탈퇴한 회원만 뺀다.
      expect(user.count).toHaveBeenNthCalledWith(1, {
        where: { role: Role.USER, userStatus: { not: UserStatus.WITHDRAWN } },
      });
      expect(user.count).toHaveBeenNthCalledWith(2, {
        where: {
          role: Role.USER,
          createDate: { lt: todayStart },
          OR: [{ deletedDate: null }, { deletedDate: { gte: todayStart } }],
        },
      });
      // 이상 거래는 미처리·확인중 건수다.
      expect(anomaly.count).toHaveBeenCalledOnce();
      expect(anomaly.count).toHaveBeenCalledWith({
        where: {
          status: { in: [AnomalyStatus.PENDING, AnomalyStatus.REVIEWING] },
        },
      });
      expect(dailyStat.findUnique).toHaveBeenCalledWith({
        where: { statDate: statDate('2026-11-18') },
      });
    });

    it('어제 일별 통계가 없으면 상장 상품·처리 대기·이상 거래 전일 대비는 null이다', async () => {
      dailyStat.findUnique.mockResolvedValue(null);

      const kpis = await service.getKpis(NOW);

      expect(kpis.listedStockChange).toBeNull();
      expect(kpis.pendingChange).toBeNull();
      expect(kpis.anomalyChange).toBeNull();
    });

    it('어제 행이 밀린 날이라 건수가 비어 있어도 null이다', async () => {
      dailyStat.findUnique.mockResolvedValue({
        listedStockCount: null,
        pendingListingCount: null,
        pendingInquiryCount: null,
        pendingAnomalyCount: null,
      });

      const kpis = await service.getKpis(NOW);

      expect(kpis.listedStockChange).toBeNull();
      expect(kpis.pendingChange).toBeNull();
      expect(kpis.anomalyChange).toBeNull();
    });

    it('어제 마감 회원이 0명이면 증감률은 null이다', async () => {
      user.count.mockReset();
      user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
      dailyStat.findUnique.mockResolvedValue(null);

      await expect(service.getKpis(NOW)).resolves.toMatchObject({
        userCount: 3,
        userChangeRate: null,
      });
    });
  });

  describe('getTradeTrend', () => {
    it('1시간은 지금이 속한 5분 구간까지 12개를 분봉으로 묶는다', async () => {
      chart.groupBy.mockResolvedValue([
        { candleTime: kst('2026-11-19T16:05:00'), ...sumOf(2n, 10_000n) },
        { candleTime: kst('2026-11-19T16:09:00'), ...sumOf(3n, 15_000n) },
        { candleTime: kst('2026-11-19T17:02:00'), ...sumOf(1n, 5_100n) },
      ]);

      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.HOUR_1 }),
        NOW,
      );

      expect(chart.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            interval: ChartInterval.MINUTE,
            candleTime: {
              gte: kst('2026-11-19T16:05:00'),
              lt: kst('2026-11-19T17:05:00'),
            },
          },
        }),
      );
      expect(trend).toMatchObject({
        unit: TradeTrendUnit.MINUTE_5,
        periodLabel: '2026.11.19 16:05 ~ 17:05',
        totalVolume: 6,
        totalTradeAmount: 30_100,
      });
      expect(trend.buckets).toHaveLength(12);
      expect(trend.buckets[0]).toEqual({
        time: kst('2026-11-19T16:05:00'),
        volume: 5,
        tradeAmount: 25_000,
      });
      expect(trend.buckets[11]).toEqual({
        time: kst('2026-11-19T17:00:00'),
        volume: 1,
        tradeAmount: 5_100,
      });
    });

    it('6시간은 30분 구간 12개다', async () => {
      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.HOUR_6 }),
        NOW,
      );

      expect(trend.unit).toBe(TradeTrendUnit.MINUTE_30);
      expect(trend.from).toEqual(kst('2026-11-19T11:30:00'));
      expect(trend.to).toEqual(kst('2026-11-19T17:30:00'));
      expect(trend.buckets).toHaveLength(12);
    });

    it('1일은 오늘 00~24시를 시간봉으로 3시간씩 8개로 묶는다', async () => {
      chart.groupBy.mockResolvedValue([
        { candleTime: kst('2026-11-19T04:00:00'), ...sumOf(7n, 35_000n) },
        { candleTime: kst('2026-11-19T05:00:00'), ...sumOf(3n, 15_000n) },
      ]);

      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.DAY_1 }),
        NOW,
      );

      expect(chart.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ interval: ChartInterval.HOUR }),
        }),
      );
      expect(trend.unit).toBe(TradeTrendUnit.HOUR_3);
      expect(trend.periodLabel).toBe('2026.11.19 00:00 ~ 24:00');
      expect(trend.buckets).toHaveLength(8);
      expect(trend.buckets[1]).toEqual({
        time: kst('2026-11-19T03:00:00'),
        volume: 10,
        tradeAmount: 50_000,
      });
    });

    it('1주는 일별 통계를 읽고, 행이 없는 날만 일봉으로 채운다', async () => {
      dailyStat.findMany.mockResolvedValue([
        {
          statDate: statDate('2026-11-13'),
          tradeVolume: 100n,
          tradeAmount: 500_000n,
        },
        {
          statDate: statDate('2026-11-18'),
          tradeVolume: 80n,
          tradeAmount: 410_000n,
        },
      ]);
      chart.groupBy.mockResolvedValue([
        { candleTime: kst('2026-11-19T00:00:00'), ...sumOf(20n, 104_000n) },
      ]);

      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.WEEK_1 }),
        NOW,
      );

      expect(dailyStat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            statDate: {
              gte: statDate('2026-11-13'),
              lt: statDate('2026-11-20'),
            },
          },
        }),
      );
      const [{ where }] = chart.groupBy.mock.calls[0] as [
        { where: { candleTime: { in: Date[] } } },
      ];
      expect(where.candleTime.in).toEqual([
        kst('2026-11-14T00:00:00'),
        kst('2026-11-15T00:00:00'),
        kst('2026-11-16T00:00:00'),
        kst('2026-11-17T00:00:00'),
        kst('2026-11-19T00:00:00'),
      ]);
      expect(trend).toMatchObject({
        unit: TradeTrendUnit.DAY,
        periodLabel: '2026.11.13 ~ 2026.11.19',
        totalVolume: 200,
        totalTradeAmount: 1_014_000,
      });
      expect(trend.buckets.map(({ volume }) => volume)).toEqual([
        100, 0, 0, 0, 0, 80, 20,
      ]);
    });

    it('1개월은 오늘 포함 30일이다', async () => {
      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.MONTH_1 }),
        NOW,
      );

      expect(trend.periodLabel).toBe('2026.10.21 ~ 2026.11.19');
      expect(trend.buckets).toHaveLength(30);
    });

    it('전체는 첫 체결일부터 월별로 묶는다', async () => {
      chart.findFirst.mockResolvedValue({
        candleTime: kst('2026-09-28T00:00:00'),
      });
      dailyStat.findMany.mockResolvedValue([
        {
          statDate: statDate('2026-09-30'),
          tradeVolume: 10n,
          tradeAmount: 50_000n,
        },
        {
          statDate: statDate('2026-10-01'),
          tradeVolume: 20n,
          tradeAmount: 100_000n,
        },
        {
          statDate: statDate('2026-10-31'),
          tradeVolume: 5n,
          tradeAmount: 25_000n,
        },
      ]);

      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.ALL }),
        NOW,
      );

      expect(trend.unit).toBe(TradeTrendUnit.MONTH);
      expect(trend.periodLabel).toBe('2026.09.28 ~ 2026.11.19');
      expect(trend.buckets).toEqual([
        { time: kst('2026-09-01T00:00:00'), volume: 10, tradeAmount: 50_000 },
        { time: kst('2026-10-01T00:00:00'), volume: 25, tradeAmount: 125_000 },
        { time: kst('2026-11-01T00:00:00'), volume: 0, tradeAmount: 0 },
      ]);
    });

    it('체결이 없으면 전체는 오늘 하루, 이번 달 한 구간이다', async () => {
      chart.findFirst.mockResolvedValue(null);

      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.ALL }),
        NOW,
      );

      expect(trend.periodLabel).toBe('2026.11.19 00:00 ~ 24:00');
      expect(trend.buckets).toEqual([
        { time: kst('2026-11-01T00:00:00'), volume: 0, tradeAmount: 0 },
      ]);
    });

    it.each([
      ['2026-11-19', '2026-11-19', TradeTrendUnit.HOUR, 24],
      ['2026-11-18', '2026-11-19', TradeTrendUnit.DAY, 2],
      ['2026-10-20', '2026-11-19', TradeTrendUnit.DAY, 31],
      ['2026-10-19', '2026-11-19', TradeTrendUnit.MONTH, 2],
    ])('직접 설정 %s ~ %s는 %s 단위 %i개다', async (from, to, unit, length) => {
      chart.findFirst.mockResolvedValue({
        candleTime: kst('2026-01-05T00:00:00'),
      });

      const trend = await service.getTradeTrend(
        queryOf({ range: TradeTrendRange.CUSTOM, from, to }),
        NOW,
      );

      expect(trend.unit).toBe(unit);
      expect(trend.buckets).toHaveLength(length);
    });

    it('직접 설정 월별은 시작일을 첫 체결일로 자른다', async () => {
      chart.findFirst.mockResolvedValue({
        candleTime: kst('2026-09-15T00:00:00'),
      });

      const trend = await service.getTradeTrend(
        queryOf({
          range: TradeTrendRange.CUSTOM,
          from: '2000-01-01',
          to: '2026-11-19',
        }),
        NOW,
      );

      expect(trend.unit).toBe(TradeTrendUnit.MONTH);
      expect(trend.from).toEqual(kst('2026-09-15T00:00:00'));
      expect(trend.periodLabel).toBe('2026.09.15 ~ 2026.11.19');
      expect(trend.buckets.map(({ time }) => time)).toEqual([
        kst('2026-09-01T00:00:00'),
        kst('2026-10-01T00:00:00'),
        kst('2026-11-01T00:00:00'),
      ]);
      // 잘린 시작일부터만 일봉을 읽는다.
      const [{ where }] = chart.groupBy.mock.calls[0] as [
        { where: { candleTime: { in: Date[] } } },
      ];
      expect(where.candleTime.in).toHaveLength(66);
    });

    it.each([
      ['체결이 없으면', null],
      [
        '기간 전체가 첫 체결일 전이면',
        { candleTime: kst('2026-11-01T00:00:00') },
      ],
    ])('직접 설정 월별에서 %s 마지막 날만 남긴다', async (_, first) => {
      chart.findFirst.mockResolvedValue(first);

      const trend = await service.getTradeTrend(
        queryOf({
          range: TradeTrendRange.CUSTOM,
          from: '2000-01-01',
          to: '2026-09-30',
        }),
        NOW,
      );

      expect(trend.from).toEqual(kst('2026-09-30T00:00:00'));
      expect(trend.buckets).toEqual([
        { time: kst('2026-09-01T00:00:00'), volume: 0, tradeAmount: 0 },
      ]);
    });

    it('직접 설정 일별 이하는 첫 체결일을 조회하지 않는다', async () => {
      await service.getTradeTrend(
        queryOf({
          range: TradeTrendRange.CUSTOM,
          from: '2026-11-01',
          to: '2026-11-19',
        }),
        NOW,
      );

      expect(chart.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      ['시작일이 없으면', undefined, '2026-11-19'],
      ['종료일이 없으면', '2026-11-01', undefined],
      ['시작일이 종료일보다 늦으면', '2026-11-19', '2026-11-18'],
      ['종료일이 오늘보다 늦으면', '2026-11-01', '2026-11-20'],
    ])('직접 설정에서 %s 거부한다', async (_, from, to) => {
      await expect(
        service.getTradeTrend(
          queryOf({ range: TradeTrendRange.CUSTOM, from, to }),
          NOW,
        ),
      ).rejects.toEqual(new BusinessException(DashboardErrors.INVALID_PERIOD));
    });
  });

  describe('periodLabelOf', () => {
    it('자정을 넘는 시간 범위는 날짜를 모두 적는다', () => {
      expect(
        periodLabelOf(kst('2026-11-18T23:35:00'), kst('2026-11-19T00:35:00')),
      ).toBe('2026.11.18 23:35 ~ 2026.11.19 00:35');
    });
  });
});
