import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TradeStatus } from '../../generated/prisma/client.js';
import { SearchHistoriesService } from '../search-histories/search-histories.service.js';
import { StockSort } from './stocks.constants.js';
import { StocksService } from './stocks.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('StocksService', () => {
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const viewHistory = {
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma = {
    stock: { findMany, findFirst },
    viewHistory,
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ viewHistory }),
    ),
  } as unknown as PrismaService;
  const record = vi.fn();
  const service = new StocksService(prisma, {
    record,
  } as unknown as SearchHistoriesService);

  const stockOf = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    stockCode: `MOTU${id}`,
    sectorCode: 1,
    name: `Stock${id}`,
    summary: '한 줄 소개입니다.',
    logoImageUrl: null,
    basePrice: 4_350n,
    listingDate: new Date('2026-10-01T00:00:00.000Z'),
    tradeStatus: TradeStatus.ACTIVE,
    sector: { code: 1, name: 'SaaS / 소프트웨어' },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    viewHistory.findMany.mockResolvedValue([]);
  });

  describe('getStocks', () => {
    it('삭제되지 않은 상품을 카테고리로 걸러 최근 상장순으로 조회하고 현재가는 기준가로 내려준다', async () => {
      findMany.mockResolvedValue([stockOf(1)]);

      const result = await service.getStocks({
        sectorCode: 1,
        sort: StockSort.TRADE_AMOUNT,
        size: 20,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ sectorCode: 1 }, { isDeleted: false }, {}] },
          orderBy: [{ listingDate: 'desc' }, { id: 'desc' }],
          take: 21,
        }),
      );
      expect(result).toEqual({
        items: [
          expect.objectContaining({
            stockId: 1,
            sectorName: 'SaaS / 소프트웨어',
            currentPrice: 4_350,
            changeAmount: 0,
            changeRate: 0,
            volume: 0,
            tradeAmount: 0,
          }),
        ],
        nextCursor: null,
      });
    });

    it('다음 페이지가 있으면 커서를 내려주고, 그 커서로 이어서 조회한다', async () => {
      findMany.mockResolvedValueOnce([stockOf(3), stockOf(2), stockOf(1)]);

      const first = await service.getStocks({
        sort: StockSort.TRADE_AMOUNT,
        size: 2,
      });

      expect(first.items.map(({ stockId }) => stockId)).toEqual([3, 2]);
      expect(first.nextCursor).toEqual(expect.any(String));

      findMany.mockResolvedValueOnce([stockOf(1)]);
      await service.getStocks({
        sort: StockSort.TRADE_AMOUNT,
        cursor: first.nextCursor!,
        size: 2,
      });

      const { where } = findMany.mock.calls[1][0] as {
        where: { AND: unknown[] };
      };
      expect(where.AND[2]).toEqual({
        OR: [
          { listingDate: { lt: new Date('2026-10-01T00:00:00.000Z') } },
          {
            listingDate: new Date('2026-10-01T00:00:00.000Z'),
            id: { lt: 2 },
          },
        ],
      });
    });

    it('정렬을 바꾼 뒤 이전 커서를 쓰면 처음부터 다시 불러오라고 한다', async () => {
      findMany.mockResolvedValueOnce([stockOf(2), stockOf(1)]);
      const { nextCursor } = await service.getStocks({
        sort: StockSort.TRADE_AMOUNT,
        size: 1,
      });

      await expect(
        service.getStocks({
          sort: StockSort.VOLUME,
          cursor: nextCursor!,
          size: 1,
        }),
      ).rejects.toMatchObject({ response: { code: 'STOCK_INVALID_CURSOR' } });
    });

    it('잘못된 커서는 거부한다', async () => {
      await expect(
        service.getStocks({
          sort: StockSort.TRADE_AMOUNT,
          cursor: 'not-a-cursor',
          size: 20,
        }),
      ).rejects.toMatchObject({ response: { code: 'STOCK_INVALID_CURSOR' } });
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('searchStocks', () => {
    beforeEach(() => {
      findMany.mockResolvedValue([stockOf(1)]);
    });

    it('상품명·카테고리명 부분 일치로 검색하고 회원이면 검색어를 남긴다', async () => {
      await service.searchStocks(7, { keyword: '클라우드', size: 20 });

      const { where } = findMany.mock.calls[0][0] as {
        where: { AND: unknown[] };
      };
      expect(where.AND[0]).toEqual({
        OR: [
          { name: { contains: '클라우드', mode: 'insensitive' } },
          {
            sector: { name: { contains: '클라우드', mode: 'insensitive' } },
          },
        ],
      });
      expect(record).toHaveBeenCalledWith(7, '클라우드');
    });

    it('비회원이면 검색어를 남기지 않는다', async () => {
      await service.searchStocks(undefined, { keyword: 'cloud', size: 20 });

      expect(record).not.toHaveBeenCalled();
    });

    it('다음 페이지를 불러올 때는 검색어를 다시 남기지 않는다', async () => {
      findMany.mockResolvedValueOnce([stockOf(2), stockOf(1)]);
      const { nextCursor } = await service.searchStocks(undefined, {
        keyword: 'cloud',
        size: 1,
      });

      await service.searchStocks(7, {
        keyword: 'cloud',
        cursor: nextCursor!,
        size: 1,
      });

      expect(record).not.toHaveBeenCalled();
    });
  });

  describe('getNewListings', () => {
    it('상장 후 7일 이내 상품만 New로 표시하고 한 줄 소개를 내려준다', async () => {
      findMany.mockResolvedValue([
        stockOf(2, { listingDate: new Date(Date.now() - 6 * DAY) }),
        stockOf(1, { listingDate: new Date(Date.now() - 8 * DAY) }),
      ]);

      const result = await service.getNewListings({ size: 3 });

      expect(result.items).toMatchObject([
        { stockId: 2, isNew: true, summary: '한 줄 소개입니다.' },
        { stockId: 1, isNew: false },
      ]);
    });
  });

  describe('getStock', () => {
    const detailOf = (overrides: Record<string, unknown> = {}) =>
      stockOf(5, {
        description: '상세 설명입니다.',
        mainImageUrl: 'https://example.com/main.png',
        officialUrl: null,
        operatorName: '마스외전',
        mau: 100_000n,
        dau: null,
        revenue: 1_200_000_000n,
        transactionVolume: null,
        metricsStartDate: new Date('2025-10-01T00:00:00.000Z'),
        metricsEndDate: null,
        ...overrides,
      });

    it('상세 정보와 지표를 내려주고, 없는 지표는 null로 내려준다', async () => {
      findFirst.mockResolvedValue(detailOf());

      const result = await service.getStock(undefined, 5);

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 5, isDeleted: false },
        include: { sector: true },
      });
      expect(result).toMatchObject({
        stockId: 5,
        summary: '한 줄 소개입니다.',
        description: '상세 설명입니다.',
        operatorName: '마스외전',
        officialUrl: null,
        currentPrice: 4_350,
        changeAmount: 0,
        changeRate: 0,
        metrics: {
          mau: 100_000,
          dau: null,
          revenue: 1_200_000_000,
          transactionVolume: null,
          startDate: '2025-10-01',
          endDate: null,
        },
      });
    });

    it('비회원이면 최근 본 종목에 남기지 않는다', async () => {
      findFirst.mockResolvedValue(detailOf());

      await service.getStock(undefined, 5);

      expect(viewHistory.upsert).not.toHaveBeenCalled();
    });

    it('회원이면 최근 본 종목에 남기고, 3개를 넘는 기록은 지운다', async () => {
      findFirst.mockResolvedValue(detailOf());
      viewHistory.findMany.mockResolvedValue([{ stockId: 1 }]);

      await service.getStock(7, 5);

      expect(viewHistory.upsert).toHaveBeenCalledWith({
        where: { userId_stockId: { userId: 7, stockId: 5 } },
        create: expect.objectContaining({ userId: 7, stockId: 5 }),
        update: { modifiedDate: expect.any(Date) },
      });
      expect(viewHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 }, skip: 3 }),
      );
      expect(viewHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId: 7, stockId: { in: [1] } },
      });
    });

    it('없거나 삭제된 상품이면 404', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.getStock(7, 99)).rejects.toMatchObject({
        response: { code: 'STOCK_NOT_FOUND' },
      });
      expect(viewHistory.upsert).not.toHaveBeenCalled();
    });
  });

  it('최근 본 종목을 최근 본 순서로 3개까지, 삭제된 상품은 빼고 내려준다', async () => {
    viewHistory.findMany.mockResolvedValue([{ stock: stockOf(2) }]);

    const result = await service.getRecentlyViewed(7);

    expect(viewHistory.findMany).toHaveBeenCalledWith({
      where: { userId: 7, stock: { isDeleted: false } },
      include: { stock: { include: { sector: true } } },
      orderBy: { modifiedDate: 'desc' },
      take: 3,
    });
    expect(result.items).toMatchObject([{ stockId: 2, currentPrice: 4_350 }]);
  });
});
