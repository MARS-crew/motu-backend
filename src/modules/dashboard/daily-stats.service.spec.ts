import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  ChartInterval,
  InquiryStatus,
  ListingApplicationStatus,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { DailyStatsService } from './daily-stats.service.js';

describe('DailyStatsService', () => {
  const dailyStat = { findFirst: vi.fn(), createMany: vi.fn() };
  const chart = { findFirst: vi.fn(), groupBy: vi.fn() };
  const stock = { count: vi.fn() };
  const listingApplication = { count: vi.fn() };
  const inquiry = { count: vi.fn() };
  const prisma = {
    dailyStat,
    chart,
    stock,
    listingApplication,
    inquiry,
  } as unknown as PrismaService;
  const service = new DailyStatsService(prisma);

  /** 한국 시간 그날 00시의 실제 시각 */
  const kstDay = (date: string) => new Date(`${date}T00:00:00+09:00`);
  /** 날짜 컬럼 값 */
  const statDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

  beforeEach(() => {
    vi.resetAllMocks();
    stock.count.mockResolvedValue(36);
    listingApplication.count.mockResolvedValue(5);
    inquiry.count.mockResolvedValue(3);
    chart.groupBy.mockResolvedValue([]);
    dailyStat.createMany.mockImplementation(({ data }: { data: unknown[] }) =>
      Promise.resolve({ count: data.length }),
    );
  });

  describe('collectClosedDays', () => {
    it('행이 없으면 첫 일봉 날부터 어제까지 만들고, 건수는 어제 행에만 넣는다', async () => {
      dailyStat.findFirst.mockResolvedValue(null);
      chart.findFirst.mockResolvedValue({ candleTime: kstDay('2026-11-16') });
      chart.groupBy.mockResolvedValue([
        {
          candleTime: kstDay('2026-11-16'),
          _sum: { volume: 120n, tradeAmount: 600_000n },
        },
        {
          candleTime: kstDay('2026-11-18'),
          _sum: { volume: 80n, tradeAmount: 410_000n },
        },
      ]);

      const created = await service.collectClosedDays(
        new Date('2026-11-19T12:00:00+09:00'),
      );

      expect(created).toBe(3);
      expect(chart.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            interval: ChartInterval.DAY,
            candleTime: {
              gte: kstDay('2026-11-16'),
              lte: kstDay('2026-11-18'),
            },
          },
        }),
      );
      expect(dailyStat.createMany).toHaveBeenCalledWith({
        data: [
          {
            statDate: statDate('2026-11-16'),
            tradeVolume: 120n,
            tradeAmount: 600_000n,
            listedStockCount: null,
            pendingListingCount: null,
            pendingInquiryCount: null,
          },
          {
            statDate: statDate('2026-11-17'),
            tradeVolume: 0n,
            tradeAmount: 0n,
            listedStockCount: null,
            pendingListingCount: null,
            pendingInquiryCount: null,
          },
          {
            statDate: statDate('2026-11-18'),
            tradeVolume: 80n,
            tradeAmount: 410_000n,
            listedStockCount: 36,
            pendingListingCount: 5,
            pendingInquiryCount: 3,
          },
        ],
        skipDuplicates: true,
      });
    });

    it('마지막 행 다음 날부터 만든다', async () => {
      dailyStat.findFirst.mockResolvedValue({
        statDate: statDate('2026-11-17'),
      });

      await service.collectClosedDays(new Date('2026-11-19T00:10:00+09:00'));

      expect(chart.findFirst).not.toHaveBeenCalled();
      const [{ data }] = dailyStat.createMany.mock.calls[0] as [
        { data: { statDate: Date }[] },
      ];
      expect(data.map((row) => row.statDate)).toEqual([statDate('2026-11-18')]);
    });

    it('어제 행이 이미 있으면 만들지 않는다', async () => {
      dailyStat.findFirst.mockResolvedValue({
        statDate: statDate('2026-11-18'),
      });

      const created = await service.collectClosedDays(
        new Date('2026-11-19T23:59:00+09:00'),
      );

      expect(created).toBe(0);
      expect(dailyStat.createMany).not.toHaveBeenCalled();
    });

    it('00시가 지나고 1분이 되기 전에는 전날을 마감으로 보지 않는다', async () => {
      dailyStat.findFirst.mockResolvedValue({
        statDate: statDate('2026-11-17'),
      });

      await expect(
        service.collectClosedDays(new Date('2026-11-19T00:00:30+09:00')),
      ).resolves.toBe(0);
      await expect(
        service.collectClosedDays(new Date('2026-11-19T00:01:00+09:00')),
      ).resolves.toBe(1);
    });

    it('행도 일봉도 없으면 어제 행을 거래 0으로 만든다', async () => {
      dailyStat.findFirst.mockResolvedValue(null);
      chart.findFirst.mockResolvedValue(null);

      await service.collectClosedDays(new Date('2026-11-19T12:00:00+09:00'));

      expect(dailyStat.createMany).toHaveBeenCalledWith({
        data: [
          {
            statDate: statDate('2026-11-18'),
            tradeVolume: 0n,
            tradeAmount: 0n,
            listedStockCount: 36,
            pendingListingCount: 5,
            pendingInquiryCount: 3,
          },
        ],
        skipDuplicates: true,
      });
    });

    it('행이 없고 첫 체결이 오늘이어도 어제 행을 만든다', async () => {
      dailyStat.findFirst.mockResolvedValue(null);
      chart.findFirst.mockResolvedValue({ candleTime: kstDay('2026-11-19') });

      await expect(
        service.collectClosedDays(new Date('2026-11-19T12:00:00+09:00')),
      ).resolves.toBe(1);
    });
  });

  it('countBacklog는 거래 중·거래 중지 상품, 접수·검토 중 상장 신청, 접수·처리 중 문의를 센다', async () => {
    await expect(service.countBacklog()).resolves.toEqual({
      listedStockCount: 36,
      pendingListingCount: 5,
      pendingInquiryCount: 3,
    });
    expect(stock.count).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        tradeStatus: { in: [TradeStatus.ACTIVE, TradeStatus.PAUSED] },
      },
    });
    expect(listingApplication.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            ListingApplicationStatus.SUBMITTED,
            ListingApplicationStatus.UNDER_REVIEW,
          ],
        },
        deletedDate: null,
      },
    });
    expect(inquiry.count).toHaveBeenCalledWith({
      where: {
        status: { in: [InquiryStatus.SUBMITTED, InquiryStatus.IN_PROGRESS] },
      },
    });
  });
});
