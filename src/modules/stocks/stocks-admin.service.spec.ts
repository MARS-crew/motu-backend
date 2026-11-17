import { PrismaService } from '../../common/prisma/prisma.service.js';
import { OrderStatus, TradeStatus } from '../../generated/prisma/client.js';
import { ChartsService } from '../charts/charts.service.js';
import { GetAdminStocksReqDto } from './dto/req/get-admin-stocks-req.dto.js';
import { StocksAdminService } from './stocks-admin.service.js';
import { StockVisibility } from './stocks.constants.js';

describe('StocksAdminService', () => {
  const stock = { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() };
  const order = { count: vi.fn() };
  const prisma = {
    stock,
    order,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const chartsService = { getDailySummaries: vi.fn() };
  const service = new StocksAdminService(
    prisma,
    chartsService as unknown as ChartsService,
  );

  const stockOf = (overrides: Record<string, unknown> = {}) => ({
    id: 18,
    stockCode: 'MOTU0018',
    name: 'SaaS Index',
    summary: 'SaaS 기업 성장성 기반',
    description: '모의투자 상품',
    sectorCode: 1,
    sector: { code: 1, name: 'SaaS/소프트웨어' },
    operatorName: '마스외전랩',
    officialUrl: 'https://saas.example.com',
    logoImageUrl: null,
    mainImageUrl: 'https://cdn.example.com/main.png',
    listedShares: 100_000n,
    basePrice: 12_000n,
    listingDate: new Date('2026-09-01T00:00:00Z'),
    tradeStatus: TradeStatus.ACTIVE,
    isPublic: true,
    mau: 120_000n,
    transactionVolume: 85_000_000n,
    metricsEndDate: new Date('2026-08-31T00:00:00Z'),
    ...overrides,
  });

  const queryOf = (overrides: Partial<GetAdminStocksReqDto> = {}) =>
    Object.assign(new GetAdminStocksReqDto(), overrides);

  beforeEach(() => {
    vi.clearAllMocks();
    stock.findMany.mockResolvedValue([stockOf()]);
    stock.count.mockResolvedValue(1);
    chartsService.getDailySummaries.mockImplementation(
      async (stocks: { id: number }[]) =>
        new Map(stocks.map(({ id }) => [id, { currentPrice: 12_480 }])),
    );
  });

  describe('getStocks', () => {
    it('조건 없이 조회하면 삭제되지 않은 상품을 최근 등록순으로 내려준다', async () => {
      const result = await service.getStocks(queryOf());

      expect(stock.findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          tradeStatus: undefined,
          sectorCode: undefined,
          isPublic: undefined,
          OR: undefined,
        },
        include: { sector: true },
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          {
            stockId: 18,
            stockCode: 'MOTU0018',
            name: 'SaaS Index',
            sectorCode: 1,
            sectorName: 'SaaS/소프트웨어',
            tradeStatus: TradeStatus.ACTIVE,
            isPublic: true,
            listingDate: new Date('2026-09-01T00:00:00Z'),
            currentPrice: 12_480,
          },
        ],
        page: 1,
        size: 20,
        totalCount: 1,
      });
    });

    it('상품 상태·카테고리·노출 상태로 거른다', async () => {
      await service.getStocks(
        queryOf({
          tradeStatus: TradeStatus.PAUSED,
          sectorCode: 3,
          visibility: StockVisibility.PRIVATE,
          page: 2,
          size: 10,
        }),
      );

      expect(stock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tradeStatus: TradeStatus.PAUSED,
            sectorCode: 3,
            isPublic: false,
          }),
          skip: 10,
          take: 10,
        }),
      );
    });

    it('공개 필터는 isPublic true로 거른다', async () => {
      await service.getStocks(queryOf({ visibility: StockVisibility.PUBLIC }));

      expect(stock.findMany.mock.calls[0][0].where.isPublic).toBe(true);
    });

    it('검색어는 상품명·상품 코드 부분 일치로 찾는다', async () => {
      await service.getStocks(queryOf({ keyword: 'saas' }));

      expect(stock.findMany.mock.calls[0][0].where.OR).toEqual([
        { name: { contains: 'saas', mode: 'insensitive' } },
        { stockCode: { contains: 'saas', mode: 'insensitive' } },
      ]);
    });

    it.each(['18', '018', 'PRD-018', 'prd-18'])(
      '상품 ID 형태(%s)면 ID로도 찾는다',
      async (keyword) => {
        await service.getStocks(queryOf({ keyword }));

        expect(stock.findMany.mock.calls[0][0].where.OR).toContainEqual({
          id: 18,
        });
      },
    );

    it('거래 대기 상품은 현재가를 비운다', async () => {
      stock.findMany.mockResolvedValue([
        stockOf({ tradeStatus: TradeStatus.PENDING }),
      ]);

      const result = await service.getStocks(queryOf());

      expect(result.items[0].currentPrice).toBeNull();
    });
  });

  describe('getStock', () => {
    it('거래 정보와 서비스 지표를 함께 내려준다', async () => {
      stock.findFirst.mockResolvedValue(stockOf({ isPublic: false }));
      order.count.mockResolvedValue(24);

      const result = await service.getStock(18);

      expect(stock.findFirst).toHaveBeenCalledWith({
        where: { id: 18, isDeleted: false },
        include: { sector: true },
      });
      expect(order.count).toHaveBeenCalledWith({
        where: {
          stockId: 18,
          status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
        },
      });
      expect(result).toMatchObject({
        stockId: 18,
        isPublic: false,
        currentPrice: 12_480,
        listedShares: 100_000,
        openOrderCount: 24,
        operatorName: '마스외전랩',
        metrics: {
          mau: 120_000,
          transactionVolume: 85_000_000,
          baseDate: '2026-08-31',
        },
      });
    });

    it('지표가 없으면 null로 내려준다', async () => {
      stock.findFirst.mockResolvedValue(
        stockOf({ mau: null, transactionVolume: null, metricsEndDate: null }),
      );
      order.count.mockResolvedValue(0);

      await expect(service.getStock(18)).resolves.toMatchObject({
        metrics: { mau: null, transactionVolume: null, baseDate: null },
      });
    });

    it('없거나 삭제된 상품이면 404', async () => {
      stock.findFirst.mockResolvedValue(null);

      await expect(service.getStock(999)).rejects.toMatchObject({
        response: { code: 'STOCK_NOT_FOUND' },
      });
    });
  });
});
