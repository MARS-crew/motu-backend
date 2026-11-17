import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  OrderStatus,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { ChartsService } from '../charts/charts.service.js';
import {
  StockTradingService,
  TradeStatusHooks,
} from '../matching/stock-trading.service.js';
import { UpdateAdminStockReqDto } from './dto/req/update-admin-stock-req.dto.js';
import { GetAdminStocksReqDto } from './dto/req/get-admin-stocks-req.dto.js';
import { StocksAdminService } from './stocks-admin.service.js';
import { StockVisibility } from './stocks.constants.js';

describe('StocksAdminService', () => {
  const stock = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  };
  const order = { count: vi.fn() };
  const sector = { findUnique: vi.fn() };
  const tx = { stock };
  const prisma = {
    stock,
    order,
    sector,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;
  const chartsService = { getDailySummaries: vi.fn() };
  const adminActivityLogs = { record: vi.fn() };
  /** 매칭 대신 훅을 그대로 실행한다. 현재 상품은 stock.findFirst의 값이다. */
  const runHooks =
    (canceledCount: number) =>
    async (_stockId: number, hooks: TradeStatusHooks) => {
      const current = await stock.findFirst();
      hooks.check?.(current);
      await hooks.afterChange?.(tx as never, { stock: current, canceledCount });
      return { canceledCount };
    };
  const stockTrading = {
    pauseStock: vi.fn(runHooks(24)),
    closeStock: vi.fn(runHooks(12)),
    resumeStock: vi.fn(runHooks(0)),
  };
  const service = new StocksAdminService(
    prisma,
    chartsService as unknown as ChartsService,
    stockTrading as unknown as StockTradingService,
    adminActivityLogs as unknown as AdminActivityLogsService,
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

  describe('updateStock', () => {
    const action = { adminId: 1, client: { ipAddress: '192.168.10.24' } };
    const dtoOf = (overrides: Partial<UpdateAdminStockReqDto> = {}) =>
      Object.assign(new UpdateAdminStockReqDto(), {
        name: 'SaaS Index',
        sectorCode: 1,
        isPublic: true,
        reason: '8월 확정 지표 반영',
        ...overrides,
      });

    beforeEach(() => {
      stock.findFirst.mockResolvedValue(stockOf({ statusNotice: null }));
      order.count.mockResolvedValue(0);
      sector.findUnique.mockResolvedValue({ code: 3 });
    });

    it('바뀐 항목만 활동 이력에 남기고 상세를 다시 내려준다', async () => {
      await service.updateStock(
        18,
        dtoOf({ isPublic: false, mau: 150_000, metricsBaseDate: '2026-09-30' }),
        action,
      );

      expect(stock.update).toHaveBeenCalledWith({
        where: { id: 18 },
        data: expect.objectContaining({
          isPublic: false,
          mau: 150_000n,
          transactionVolume: 85_000_000n,
          metricsEndDate: new Date('2026-09-30'),
          description: '모의투자 상품',
        }),
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        {
          adminId: 1,
          targetType: AdminActivityTarget.STOCK,
          targetId: 18,
          targetLabel: 'SaaS Index',
          action: AdminActivityAction.STOCK_UPDATE,
          summary: '노출 상태·MAU·지표 기준일 수정',
          before: {
            isPublic: true,
            mau: 120_000,
            metricsBaseDate: '2026-08-31',
          },
          after: {
            isPublic: false,
            mau: 150_000,
            metricsBaseDate: '2026-09-30',
          },
          reason: '8월 확정 지표 반영',
          client: { ipAddress: '192.168.10.24' },
        },
        tx,
      );
      expect(sector.findUnique).not.toHaveBeenCalled();
    });

    it('null을 보내면 선택 항목을 지운다', async () => {
      await service.updateStock(
        18,
        dtoOf({
          description: null,
          mau: null,
          transactionVolume: null,
          metricsBaseDate: null,
        }),
        action,
      );

      expect(stock.update.mock.calls[0][0].data).toMatchObject({
        description: null,
        mau: null,
        transactionVolume: null,
        metricsEndDate: null,
      });
    });

    it('카테고리를 바꾸면 있는 카테고리인지 확인한다', async () => {
      sector.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStock(18, dtoOf({ sectorCode: 99 }), action),
      ).rejects.toMatchObject({ response: { code: 'STOCK_SECTOR_NOT_FOUND' } });
      expect(stock.update).not.toHaveBeenCalled();
    });

    it('지표가 남는데 기준일을 지우면 400', async () => {
      await expect(
        service.updateStock(18, dtoOf({ metricsBaseDate: null }), action),
      ).rejects.toMatchObject({
        response: { code: 'STOCK_METRICS_DATE_REQUIRED' },
      });
    });

    it('바뀐 것이 없으면 400', async () => {
      await expect(
        service.updateStock(18, dtoOf(), action),
      ).rejects.toMatchObject({ response: { code: 'STOCK_NOT_CHANGED' } });
      expect(adminActivityLogs.record).not.toHaveBeenCalled();
    });

    it('없는 상품이면 404', async () => {
      stock.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStock(999, dtoOf(), action),
      ).rejects.toMatchObject({ response: { code: 'STOCK_NOT_FOUND' } });
    });
  });

  describe('거래 중지·재개·종료', () => {
    const action = { adminId: 1 };

    it('거래 가능 상품을 중지하고 안내문과 취소 주문 수를 이력에 남긴다', async () => {
      stock.findFirst.mockResolvedValue(stockOf({ statusNotice: null }));

      await expect(
        service.pauseStock(
          18,
          { reason: '가격 데이터 점검', notice: '점검으로 일시 중지합니다.' },
          action,
        ),
      ).resolves.toEqual({
        stockId: 18,
        statusBefore: TradeStatus.ACTIVE,
        statusAfter: TradeStatus.PAUSED,
        canceledOrderCount: 24,
      });
      expect(stock.update).toHaveBeenCalledWith({
        where: { id: 18 },
        data: { statusNotice: '점검으로 일시 중지합니다.' },
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminActivityAction.STOCK_PAUSE,
          summary: '거래 가능 → 거래 중지',
          before: { tradeStatus: TradeStatus.ACTIVE, statusNotice: null },
          after: {
            tradeStatus: TradeStatus.PAUSED,
            statusNotice: '점검으로 일시 중지합니다.',
            canceledOrderCount: 24,
          },
          reason: '가격 데이터 점검',
        }),
        tx,
      );
    });

    it.each([TradeStatus.PENDING, TradeStatus.PAUSED, TradeStatus.CLOSED])(
      '%s 상품은 중지할 수 없다',
      async (tradeStatus) => {
        stock.findFirst.mockResolvedValue(stockOf({ tradeStatus }));

        await expect(
          service.pauseStock(18, { reason: '점검' }, action),
        ).rejects.toMatchObject({
          response: {
            code: 'STOCK_INVALID_TRADE_STATUS',
            details: { tradeStatus },
          },
        });
        expect(adminActivityLogs.record).not.toHaveBeenCalled();
      },
    );

    it('중지 상품을 재개하면 안내문을 지운다', async () => {
      stock.findFirst.mockResolvedValue(
        stockOf({ tradeStatus: TradeStatus.PAUSED, statusNotice: '점검 중' }),
      );

      await expect(
        service.resumeStock(18, '점검 완료', action),
      ).resolves.toEqual({
        stockId: 18,
        statusBefore: TradeStatus.PAUSED,
        statusAfter: TradeStatus.ACTIVE,
        canceledOrderCount: 0,
      });
      expect(stock.update).toHaveBeenCalledWith({
        where: { id: 18 },
        data: { statusNotice: null },
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminActivityAction.STOCK_RESUME,
          summary: '거래 중지 → 거래 가능',
        }),
        tx,
      );
    });

    it('거래 가능 상품은 재개할 수 없다', async () => {
      stock.findFirst.mockResolvedValue(stockOf());

      await expect(
        service.resumeStock(18, '점검 완료', action),
      ).rejects.toMatchObject({
        response: { code: 'STOCK_INVALID_TRADE_STATUS' },
      });
    });

    it.each([TradeStatus.PENDING, TradeStatus.ACTIVE, TradeStatus.PAUSED])(
      '%s 상품을 종료할 수 있다',
      async (tradeStatus) => {
        stock.findFirst.mockResolvedValue(stockOf({ tradeStatus }));

        await expect(
          service.closeStock(
            18,
            { reason: '서비스 운영 종료', notice: '2026.09.10부로 거래 종료' },
            action,
          ),
        ).resolves.toMatchObject({
          statusBefore: tradeStatus,
          statusAfter: TradeStatus.CLOSED,
          canceledOrderCount: 12,
        });
        expect(adminActivityLogs.record).toHaveBeenCalledWith(
          expect.objectContaining({ action: AdminActivityAction.STOCK_CLOSE }),
          tx,
        );
      },
    );

    it('이미 종료된 상품은 다시 종료할 수 없다', async () => {
      stock.findFirst.mockResolvedValue(
        stockOf({ tradeStatus: TradeStatus.CLOSED }),
      );

      await expect(
        service.closeStock(18, { reason: '종료', notice: '종료' }, action),
      ).rejects.toMatchObject({
        response: { code: 'STOCK_INVALID_TRADE_STATUS' },
      });
    });
  });
});
