import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { OrderSide } from '../../generated/prisma/client.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { TradesService } from './trades.service.js';

describe('TradesService', () => {
  const stock = { findFirst: vi.fn() };
  const trade = { findMany: vi.fn() };
  const prisma = { stock, trade } as unknown as PrismaService;
  const service = new TradesService(prisma);

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
    stock.findFirst.mockResolvedValue({ id: 1 });
  });

  describe('getRecentTrades', () => {
    const date = new Date('2026-10-24T09:31:41.000Z');

    it('그 종목의 최근 체결 5건을 최신순으로 돌려준다', async () => {
      trade.findMany.mockResolvedValue([
        {
          id: 104n,
          stockId: 1,
          buyOrderId: 30n,
          sellOrderId: 12n,
          price: 4_400n,
          qty: 1n,
          createDate: date,
        },
        {
          id: 103n,
          stockId: 1,
          buyOrderId: 15n,
          sellOrderId: 29n,
          price: 4_350n,
          qty: 3n,
          createDate: date,
        },
      ]);

      const result = await service.getRecentTrades(1);

      expect(stock.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        select: { id: true },
      });
      expect(trade.findMany).toHaveBeenCalledWith({
        where: { stockId: 1 },
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        take: 5,
      });
      expect(result).toEqual({
        stockId: 1,
        items: [
          {
            tradeId: 104,
            price: 4_400,
            qty: 1,
            side: OrderSide.BUY,
            createDate: date,
          },
          {
            tradeId: 103,
            price: 4_350,
            qty: 3,
            side: OrderSide.SELL,
            createDate: date,
          },
        ],
      });
    });

    it('체결이 없으면 빈 목록이다', async () => {
      trade.findMany.mockResolvedValue([]);

      const result = await service.getRecentTrades(1);

      expect(result).toEqual({ stockId: 1, items: [] });
    });

    it('없거나 삭제된 상품이면 조회할 수 없다', async () => {
      stock.findFirst.mockResolvedValue(null);

      const error = await errorOf(service.getRecentTrades(1));

      expect(error.error).toBe(StockErrors.NOT_FOUND);
      expect(trade.findMany).not.toHaveBeenCalled();
    });
  });
});
