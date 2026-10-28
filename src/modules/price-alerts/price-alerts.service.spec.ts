import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma, TradeStatus } from '../../generated/prisma/client.js';
import { ChartsService } from '../charts/charts.service.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { PriceAlertErrors } from './price-alerts.errors.js';
import { PriceAlertsService } from './price-alerts.service.js';

const USER_ID = 7;
const CREATE_DATE = new Date('2026-10-28T01:00:00.000Z');

describe('PriceAlertsService', () => {
  const stock = { findFirst: vi.fn() };
  const priceAlert = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma = { stock, priceAlert } as unknown as PrismaService;
  const charts = { getDailySummaries: vi.fn() };
  const service = new PriceAlertsService(
    prisma,
    charts as unknown as ChartsService,
  );

  const stockOf = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    name: 'PLI',
    basePrice: 5_000n,
    tradeStatus: TradeStatus.ACTIVE,
    priceTickSize: 10n,
    minOrderPrice: 100n,
    ...overrides,
  });

  const alertOf = (overrides: Record<string, unknown> = {}) => ({
    id: 12,
    userId: USER_ID,
    stockId: 1,
    targetPrice: 7_000n,
    isActive: true,
    version: 0n,
    triggeredDate: null,
    createDate: CREATE_DATE,
    modifiedDate: CREATE_DATE,
    ...overrides,
  });

  /** 상품별 현재가를 정한다. */
  const currentPrices = (prices: Record<number, number>) =>
    charts.getDailySummaries.mockImplementation((stocks: { id: number }[]) =>
      Promise.resolve(
        new Map(
          stocks.map(({ id }) => [
            id,
            { stockId: id, currentPrice: prices[id] },
          ]),
        ),
      ),
    );

  const duplicateError = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });

  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as BusinessException;
    }
    throw new Error('예외가 발생하지 않았습니다.');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stock.findFirst.mockResolvedValue(stockOf());
    currentPrices({ 1: 6_750 });
    priceAlert.create.mockImplementation(({ data }) =>
      Promise.resolve(alertOf({ ...data })),
    );
  });

  describe('createAlert', () => {
    it('알림을 만들고 현재가와 함께 돌려준다', async () => {
      const result = await service.createAlert(USER_ID, {
        stockId: 1,
        targetPrice: 7_000,
      });

      expect(priceAlert.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, stockId: 1, targetPrice: 7_000n },
      });
      expect(result).toEqual({
        alertId: 12,
        stockId: 1,
        stockName: 'PLI',
        targetPrice: 7_000,
        currentPrice: 6_750,
        isActive: true,
        triggeredDate: null,
        createDate: CREATE_DATE,
      });
    });

    it('현재가보다 낮은 가격도 설정할 수 있다', async () => {
      await service.createAlert(USER_ID, { stockId: 1, targetPrice: 6_000 });

      expect(priceAlert.create).toHaveBeenCalled();
    });

    it('거래 중지된 상품에도 설정할 수 있다', async () => {
      stock.findFirst.mockResolvedValue(
        stockOf({ tradeStatus: TradeStatus.PAUSED }),
      );

      await service.createAlert(USER_ID, { stockId: 1, targetPrice: 7_000 });

      expect(priceAlert.create).toHaveBeenCalled();
    });

    it('없거나 삭제된 상품이면 거부한다', async () => {
      stock.findFirst.mockResolvedValue(null);

      const error = await errorOf(
        service.createAlert(USER_ID, { stockId: 1, targetPrice: 7_000 }),
      );

      expect(stock.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, isDeleted: false } }),
      );
      expect(error.error).toBe(StockErrors.NOT_FOUND);
    });

    it.each([TradeStatus.PENDING, TradeStatus.CLOSED])(
      '%s 상품이면 거부한다',
      async (tradeStatus) => {
        stock.findFirst.mockResolvedValue(stockOf({ tradeStatus }));

        const error = await errorOf(
          service.createAlert(USER_ID, { stockId: 1, targetPrice: 7_000 }),
        );

        expect(error.error).toBe(PriceAlertErrors.STOCK_NOT_ALERTABLE);
        expect(priceAlert.create).not.toHaveBeenCalled();
      },
    );

    it('호가 단위에 맞지 않으면 거부한다', async () => {
      const error = await errorOf(
        service.createAlert(USER_ID, { stockId: 1, targetPrice: 7_005 }),
      );

      expect(error.error).toBe(PriceAlertErrors.INVALID_PRICE_TICK);
      expect(priceAlert.create).not.toHaveBeenCalled();
    });

    it('최소 주문 가격보다 낮으면 거부한다', async () => {
      const error = await errorOf(
        service.createAlert(USER_ID, { stockId: 1, targetPrice: 90 }),
      );

      expect(error.error).toBe(PriceAlertErrors.PRICE_TOO_LOW);
    });

    it('현재가와 같으면 거부한다', async () => {
      const error = await errorOf(
        service.createAlert(USER_ID, { stockId: 1, targetPrice: 6_750 }),
      );

      expect(error.error).toBe(PriceAlertErrors.SAME_AS_CURRENT_PRICE);
      expect(priceAlert.create).not.toHaveBeenCalled();
    });

    it('같은 상품에 같은 가격의 알림이 있으면 거부한다', async () => {
      priceAlert.create.mockRejectedValue(duplicateError());

      const error = await errorOf(
        service.createAlert(USER_ID, { stockId: 1, targetPrice: 7_000 }),
      );

      expect(error.error).toBe(PriceAlertErrors.DUPLICATE);
    });
  });
});
