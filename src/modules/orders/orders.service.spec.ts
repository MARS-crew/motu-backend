import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
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
  const order = { findFirst: vi.fn() };
  const tx = {
    $queryRaw: vi.fn(),
    account: { update: vi.fn() },
    holding: { update: vi.fn() },
    order: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  };
  const transaction = vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx),
  );
  const prisma = {
    stock,
    order,
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

  const lockedHoldingOf = (qty: bigint, lockedQty: bigint) => [
    { holding_id: 11, account_id: ACCOUNT_ID, qty, locked_qty: lockedQty },
  ];

  const orderOf =
    (side: OrderSide) =>
    (price: number, qty: number, stockId = 1): CreateOrderReqDto => ({
      clientOrderId: CLIENT_ORDER_ID,
      stockId,
      side,
      price,
      qty,
    });
  const buyOf = orderOf(OrderSide.BUY);
  const sellOf = orderOf(OrderSide.SELL);

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
    order.findFirst.mockResolvedValue(null);
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

  describe('placeOrder (매도)', () => {
    it('주문 수량만큼 보유 수량을 예약하고 접수 상태의 주문을 만든다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedHoldingOf(10n, 0n));

      const result = await service.placeOrder(USER_ID, sellOf(5_000, 4));

      expect(tx.holding.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { lockedQty: { increment: 4n } },
      });
      expect(tx.order.create).toHaveBeenCalledWith({
        data: {
          accountId: ACCOUNT_ID,
          stockId: 1,
          clientOrderId: CLIENT_ORDER_ID,
          side: OrderSide.SELL,
          price: 5_000n,
          qty: 4n,
          lockedAmount: 0n,
        },
      });
      expect(tx.account.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        side: OrderSide.SELL,
        qty: 4,
        remainingQty: 4,
        lockedAmount: 0,
        status: OrderStatus.ACCEPTED,
      });
    });

    it('이미 예약된 수량을 빼고 매도 가능 수량을 계산한다', async () => {
      // 매도 가능 수량 = 10 - 7 = 3 < 4
      tx.$queryRaw.mockResolvedValue(lockedHoldingOf(10n, 7n));

      const error = await errorOf(
        service.placeOrder(USER_ID, sellOf(5_000, 4)),
      );

      expect(error.error).toBe(OrderErrors.INSUFFICIENT_QTY);
      expect(error.getResponse()).toMatchObject({
        details: { sellableQty: 3 },
      });
      expect(tx.holding.update).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('매도 가능 수량과 주문 수량이 같으면 주문할 수 있다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedHoldingOf(10n, 6n));

      await service.placeOrder(USER_ID, sellOf(5_000, 4));

      expect(tx.order.create).toHaveBeenCalled();
    });

    it('보유하지 않은 상품은 매도 가능 수량이 0이다', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const error = await errorOf(
        service.placeOrder(USER_ID, sellOf(5_000, 1)),
      );

      expect(error.error).toBe(OrderErrors.INSUFFICIENT_QTY);
      expect(error.getResponse()).toMatchObject({
        details: { sellableQty: 0 },
      });
    });

    it('보유 행을 잠근 뒤 수량을 확인한다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedHoldingOf(10n, 0n));

      await service.placeOrder(USER_ID, sellOf(5_000, 4));

      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('?')).toMatch(/FROM holdings[\s\S]*FOR UPDATE/);
    });

    it('주문 규칙을 어기면 수량을 예약하지 않는다', async () => {
      const error = await errorOf(
        service.placeOrder(USER_ID, sellOf(5_005, 4)),
      );

      expect(error.error).toBe(OrderErrors.INVALID_PRICE_TICK);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('placeOrder (중복 요청)', () => {
    const existingOrder = {
      id: 100n,
      accountId: ACCOUNT_ID,
      stockId: 1,
      clientOrderId: CLIENT_ORDER_ID,
      side: OrderSide.BUY,
      orderType: OrderType.LIMIT,
      price: 5_000n,
      qty: 200n,
      filledQty: 50n,
      lockedAmount: 750_000n,
      status: OrderStatus.PARTIAL,
      canceledDate: null,
      createDate: CREATE_DATE,
    };

    it('같은 clientOrderId로 접수된 주문이 있으면 새로 만들지 않고 그 주문을 돌려준다', async () => {
      order.findFirst.mockResolvedValue(existingOrder);

      const result = await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(order.findFirst).toHaveBeenCalledWith({
        where: { clientOrderId: CLIENT_ORDER_ID, account: { userId: USER_ID } },
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        orderId: 100,
        filledQty: 50,
        remainingQty: 150,
        status: OrderStatus.PARTIAL,
      });
    });

    it('재전송 전에 상품이 거래 중지돼도 접수된 주문을 돌려준다', async () => {
      order.findFirst.mockResolvedValue(existingOrder);
      stock.findFirst.mockResolvedValue(
        stockOf({ tradeStatus: TradeStatus.PAUSED }),
      );

      const result = await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(result.orderId).toBe(100);
    });

    it.each([
      ['상품', buyOf(5_000, 200, 2)],
      ['방향', sellOf(5_000, 200)],
      ['가격', buyOf(5_010, 200)],
      ['수량', buyOf(5_000, 201)],
    ])('같은 clientOrderId인데 %s이 다르면 주문할 수 없다', async (_, dto) => {
      order.findFirst.mockResolvedValue(existingOrder);

      const error = await errorOf(service.placeOrder(USER_ID, dto));

      expect(error.error).toBe(OrderErrors.CLIENT_ID_REUSED);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('같은 요청이 동시에 들어와 먼저 접수된 주문이 있으면 그 주문을 돌려준다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(3_000_000n, 0n));
      tx.order.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      order.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingOrder);

      const result = await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(result.orderId).toBe(100);
      expect(order.findFirst).toHaveBeenCalledTimes(2);
    });

    it('동시에 들어온 요청의 내용이 다르면 주문할 수 없다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(3_000_000n, 0n));
      tx.order.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      order.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...existingOrder, price: 4_000n });

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(OrderErrors.CLIENT_ID_REUSED);
    });
  });

  describe('cancelOrder', () => {
    const ORDER_ID = 100;

    const orderRowOf = (overrides: Record<string, unknown> = {}) => ({
      id: 100n,
      accountId: ACCOUNT_ID,
      stockId: 1,
      clientOrderId: CLIENT_ORDER_ID,
      side: OrderSide.BUY,
      orderType: OrderType.LIMIT,
      price: 5_000n,
      qty: 10n,
      filledQty: 0n,
      lockedAmount: 50_000n,
      status: OrderStatus.ACCEPTED,
      canceledDate: null,
      createDate: CREATE_DATE,
      ...overrides,
    });

    const givenOrder = (overrides: Record<string, unknown> = {}) => {
      tx.$queryRaw.mockResolvedValue([{ order_id: 100n }]);
      tx.order.findUniqueOrThrow.mockResolvedValue(orderRowOf(overrides));
    };

    beforeEach(() => {
      tx.order.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...orderRowOf(), ...data }),
      );
    });

    it('매수 주문을 취소하면 남은 예약 포인트를 풀고 취소 상태로 바꾼다', async () => {
      givenOrder();

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: {
          lockedCash: { decrement: 50_000n },
          version: { increment: 1 },
        },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 100n },
        data: {
          status: OrderStatus.CANCELED,
          lockedAmount: 0n,
          canceledDate: expect.any(Date),
        },
      });
      expect(tx.holding.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        orderId: 100,
        status: OrderStatus.CANCELED,
        remainingQty: 0,
        lockedAmount: 0,
      });
    });

    it('일부 체결된 매수 주문은 남아 있는 예약 포인트만 푼다', async () => {
      givenOrder({
        status: OrderStatus.PARTIAL,
        filledQty: 4n,
        lockedAmount: 30_000n,
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: {
          lockedCash: { decrement: 30_000n },
          version: { increment: 1 },
        },
      });
    });

    it('매도 주문을 취소하면 미체결 수량만큼 예약 수량을 푼다', async () => {
      givenOrder({
        side: OrderSide.SELL,
        status: OrderStatus.PARTIAL,
        filledQty: 4n,
        lockedAmount: 0n,
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(tx.holding.update).toHaveBeenCalledWith({
        where: { accountId_stockId: { accountId: ACCOUNT_ID, stockId: 1 } },
        data: { lockedQty: { decrement: 6n } },
      });
      expect(tx.account.update).not.toHaveBeenCalled();
    });

    it('이미 취소된 주문은 그대로 돌려준다', async () => {
      const canceledDate = new Date('2026-10-24T02:00:00.000Z');
      givenOrder({
        status: OrderStatus.CANCELED,
        lockedAmount: 0n,
        canceledDate,
      });

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(result).toMatchObject({
        status: OrderStatus.CANCELED,
        canceledDate,
      });
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(tx.account.update).not.toHaveBeenCalled();
      expect(tx.holding.update).not.toHaveBeenCalled();
    });

    it('전부 체결된 주문은 취소할 수 없다', async () => {
      givenOrder({
        status: OrderStatus.FILLED,
        filledQty: 10n,
        lockedAmount: 0n,
      });

      const error = await errorOf(service.cancelOrder(USER_ID, ORDER_ID));

      expect(error.error).toBe(OrderErrors.NOT_CANCELABLE);
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('없거나 다른 회원의 주문은 찾을 수 없다', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const error = await errorOf(service.cancelOrder(USER_ID, ORDER_ID));

      expect(error.error).toBe(OrderErrors.NOT_FOUND);
    });

    it('내 주문 행을 잠근 뒤 상태를 확인한다', async () => {
      givenOrder();

      await service.cancelOrder(USER_ID, ORDER_ID);

      const [sql, ...values] = tx.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(sql.join('?')).toMatch(/FROM orders[\s\S]*FOR UPDATE/);
      expect(values).toEqual([100n, USER_ID]);
    });
  });
});
