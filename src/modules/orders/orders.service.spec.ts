import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
import { OrderErrors } from './orders.errors.js';
import { OrdersService } from './orders.service.js';

const USER_ID = 7;
const ACCOUNT_ID = 3;
const CLIENT_ORDER_ID = '3f2a9c1e-8b7d-4c5e-9f10-2a3b4c5d6e7f';
const CREATE_DATE = new Date('2026-10-24T01:00:00.000Z');

describe('OrdersService', () => {
  const stock = { findFirst: vi.fn() };
  const tx = {
    $queryRaw: vi.fn(),
    account: { update: vi.fn() },
    order: { create: vi.fn() },
  };
  const transaction = vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx),
  );
  const prisma = {
    stock,
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new OrdersService(prisma);

  const stockOf = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    tradeStatus: TradeStatus.ACTIVE,
    priceTickSize: 10n,
    minOrderPrice: 10n,
    minOrderQty: 1n,
    ...overrides,
  });

  const lockedAccountOf = (cash: bigint, lockedCash: bigint) => [
    { account_id: ACCOUNT_ID, cash, locked_cash: lockedCash },
  ];

  const buyOf = (price: number, qty: number): CreateOrderReqDto => ({
    clientOrderId: CLIENT_ORDER_ID,
    stockId: 1,
    side: OrderSide.BUY,
    price,
    qty,
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
    tx.order.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 100n,
        orderType: OrderType.LIMIT,
        filledQty: 0n,
        status: OrderStatus.ACCEPTED,
        canceledDate: null,
        createDate: CREATE_DATE,
        ...data,
      }),
    );
  });

  describe('placeOrder (매수)', () => {
    it('주문 금액만큼 포인트를 예약하고 접수 상태의 주문을 만든다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(3_000_000n, 0n));

      const result = await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: {
          lockedCash: { increment: 1_000_000n },
          version: { increment: 1 },
        },
      });
      expect(tx.order.create).toHaveBeenCalledWith({
        data: {
          accountId: ACCOUNT_ID,
          stockId: 1,
          clientOrderId: CLIENT_ORDER_ID,
          side: OrderSide.BUY,
          price: 5_000n,
          qty: 200n,
          lockedAmount: 1_000_000n,
        },
      });
      expect(result).toEqual({
        orderId: 100,
        clientOrderId: CLIENT_ORDER_ID,
        stockId: 1,
        side: OrderSide.BUY,
        orderType: OrderType.LIMIT,
        price: 5_000,
        qty: 200,
        filledQty: 0,
        remainingQty: 200,
        lockedAmount: 1_000_000,
        status: OrderStatus.ACCEPTED,
        createDate: CREATE_DATE,
        canceledDate: null,
      });
    });

    it('이미 예약된 포인트를 빼고 사용 가능 포인트를 계산한다', async () => {
      // 사용 가능 포인트 = 1,000,000 - 1,000,000 + 999,990 = 999,990 < 1,000,000
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(1_999_990n, 1_000_000n));

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(OrderErrors.INSUFFICIENT_CASH);
      expect(error.getResponse()).toMatchObject({
        details: { availableCash: 999_990, requiredAmount: 1_000_000 },
      });
      expect(tx.account.update).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('사용 가능 포인트와 주문 금액이 같으면 주문할 수 있다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(1_000_000n, 0n));

      await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(tx.order.create).toHaveBeenCalled();
    });

    it('계좌 행을 잠근 뒤 포인트를 확인한다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(3_000_000n, 0n));

      await service.placeOrder(USER_ID, buyOf(5_000, 200));

      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('?')).toContain('FOR UPDATE');
    });

    it('없거나 삭제된 상품이면 주문할 수 없다', async () => {
      stock.findFirst.mockResolvedValue(null);

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(StockErrors.NOT_FOUND);
      expect(stock.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
      });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('주문 규칙을 어기면 포인트를 예약하지 않는다', async () => {
      stock.findFirst.mockResolvedValue(
        stockOf({ tradeStatus: TradeStatus.PAUSED }),
      );

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(OrderErrors.STOCK_NOT_TRADABLE);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('계좌가 없으면 주문할 수 없다', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(AccountErrors.NOT_FOUND);
    });
  });
});
