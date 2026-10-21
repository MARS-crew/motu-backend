import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TradeStatus } from '../../generated/prisma/client.js';
import { SearchHistoriesService } from '../search-histories/search-histories.service.js';
import { StockSort } from './stocks.constants.js';
import { StocksService } from './stocks.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('StocksService', () => {
  const findMany = vi.fn();
  const prisma = { stock: { findMany } } as unknown as PrismaService;
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
});
