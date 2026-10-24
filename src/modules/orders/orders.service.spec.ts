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
import { ChartsService } from '../charts/charts.service.js';
import { MatchingService } from '../matching/matching.service.js';
import { SettlementService } from '../matching/settlement.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
import { OrderListStatus } from './orders.constants.js';
import { OrderErrors } from './orders.errors.js';
import { OrdersService } from './orders.service.js';

const USER_ID = 7;
const ACCOUNT_ID = 3;
const CLIENT_ORDER_ID = '3f2a9c1e-8b7d-4c5e-9f10-2a3b4c5d6e7f';
const CREATE_DATE = new Date('2026-10-24T01:00:00.000Z');

describe('OrdersService', () => {
  const stock = { findFirst: vi.fn() };
  const order = { findFirst: vi.fn(), findMany: vi.fn() };
  const trade = { findMany: vi.fn() };
  const account = { findUnique: vi.fn() };
  const holding = { findUnique: vi.fn() };
  const tx = {
    $queryRaw: vi.fn(),
    stock: { findUniqueOrThrow: vi.fn() },
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
    trade,
    account,
    holding,
    $transaction: transaction,
  } as unknown as PrismaService;
  const matching = {
    runExclusive: vi.fn((_: number, task: () => Promise<unknown>) => task()),
    match: vi.fn(),
    apply: vi.fn(),
    publishTrades: vi.fn(),
    removeOrder: vi.fn(),
    reloadBook: vi.fn(),
    depth: vi.fn(),
  };
  const settlement = {
    lockAccounts: vi.fn(),
    settle: vi.fn(),
  };
  const charts = { recordTrades: vi.fn() };
  const service = new OrdersService(
    prisma,
    matching as unknown as MatchingService,
    settlement as unknown as SettlementService,
    charts as unknown as ChartsService,
  );

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
    trade.findMany.mockResolvedValue([]);
    tx.stock.findUniqueOrThrow.mockResolvedValue({
      tradeStatus: TradeStatus.ACTIVE,
    });
    account.findUnique.mockResolvedValue({
      id: ACCOUNT_ID,
      cash: 3_000_000n,
      lockedCash: 0n,
    });
    matching.match.mockImplementation((_, { qty }: { qty: bigint }) => ({
      selfTrade: false,
      fills: [],
      remainingQty: qty,
    }));
    settlement.settle.mockImplementation((_, created: unknown) =>
      Promise.resolve({ order: created, trades: [] }),
    );
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

      // 주문 금액 5,000 × 200 = 1,000,000, 수수료 0.02% = 200

      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: ACCOUNT_ID },
        data: {
          lockedCash: { increment: 1_000_200n },
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
          lockedAmount: 1_000_200n,
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
        orderAmount: 1_000_000,
        lockedAmount: 1_000_200,
        status: OrderStatus.ACCEPTED,
        createDate: CREATE_DATE,
        canceledDate: null,
      });
    });

    it('이미 예약된 포인트를 빼고 사용 가능 포인트를 계산한다', async () => {
      // 사용 가능 포인트 = 2,000,190 - 1,000,000 = 1,000,190 < 1,000,200
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(2_000_190n, 1_000_000n));

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(OrderErrors.INSUFFICIENT_CASH);
      expect(error.getResponse()).toMatchObject({
        details: { availableCash: 1_000_190, requiredAmount: 1_000_200 },
      });
      expect(tx.account.update).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('사용 가능 포인트와 예약할 금액(주문 금액 + 수수료)이 같으면 주문할 수 있다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(1_000_200n, 0n));

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
      account.findUnique.mockResolvedValue(null);

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(AccountErrors.NOT_FOUND);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('placeOrder (매칭)', () => {
    const fills = [
      { makerOrderId: 11n, makerAccountId: 9, price: 4_900n, qty: 50n },
      { makerOrderId: 12n, makerAccountId: 5, price: 5_000n, qty: 30n },
    ];

    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(3_000_000n, 0n));
    });

    it('종목별 순서 안에서 내 계좌로 매칭을 계산한다', async () => {
      await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(matching.runExclusive).toHaveBeenCalledWith(
        1,
        expect.any(Function),
      );
      expect(matching.match).toHaveBeenCalledWith(1, {
        accountId: ACCOUNT_ID,
        side: OrderSide.BUY,
        price: 5_000n,
        qty: 200n,
      });
    });

    it('순서를 기다리는 사이 거래가 중지·종료됐으면 예약하지 않고 거부한다', async () => {
      tx.stock.findUniqueOrThrow.mockResolvedValue({
        tradeStatus: TradeStatus.CLOSED,
      });

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(tx.stock.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { tradeStatus: true },
      });
      expect(error.error).toBe(OrderErrors.STOCK_NOT_TRADABLE);
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(matching.apply).not.toHaveBeenCalled();
      expect(matching.reloadBook).not.toHaveBeenCalled();
    });

    it('자기 체결이면 예약하지 않고 주문을 거부한다', async () => {
      matching.match.mockReturnValue({ selfTrade: true });

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(OrderErrors.SELF_TRADE);
      expect(transaction).not.toHaveBeenCalled();
      expect(matching.apply).not.toHaveBeenCalled();
    });

    it('예약보다 먼저 관련 계좌를 모두 잠근다', async () => {
      matching.match.mockReturnValue({
        selfTrade: false,
        fills,
        remainingQty: 120n,
      });

      await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(settlement.lockAccounts).toHaveBeenCalledWith(tx, [
        ACCOUNT_ID,
        9,
        5,
      ]);
      expect(settlement.lockAccounts.mock.invocationCallOrder[0]).toBeLessThan(
        tx.$queryRaw.mock.invocationCallOrder[0],
      );
    });

    it('같은 트랜잭션에서 주문을 만든 뒤 정산하고, 커밋 후 호가창에 반영하고 체결을 알린다', async () => {
      matching.match.mockReturnValue({
        selfTrade: false,
        fills,
        remainingQty: 120n,
      });
      const trades = [{ trade: { id: 101n } }];
      settlement.settle.mockImplementation((_, created: object) =>
        Promise.resolve({
          order: { ...created, filledQty: 80n, status: OrderStatus.PARTIAL },
          trades,
        }),
      );

      const result = await service.placeOrder(USER_ID, buyOf(5_000, 200));

      const [settleTx, created, settleFills] = settlement.settle.mock.calls[0];
      expect(settleTx).toBe(tx);
      expect(created).toMatchObject({
        id: 100n,
        clientOrderId: CLIENT_ORDER_ID,
      });
      expect(settleFills).toBe(fills);
      expect(matching.apply).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ id: 100n, filledQty: 80n }),
        fills,
      );
      expect(matching.publishTrades).toHaveBeenCalledWith(trades);
      expect(result).toMatchObject({
        filledQty: 80,
        remainingQty: 120,
        status: OrderStatus.PARTIAL,
      });
    });

    it('예상하지 못한 에러로 트랜잭션이 실패하면 그 종목의 호가창을 DB 기준으로 다시 만든다', async () => {
      matching.match.mockReturnValue({
        selfTrade: false,
        fills,
        remainingQty: 120n,
      });
      settlement.settle.mockRejectedValue(
        new Error('호가창과 DB의 주문이 다릅니다: order=11'),
      );

      await expect(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      ).rejects.toThrow('호가창과 DB의 주문이 다릅니다');
      expect(matching.reloadBook).toHaveBeenCalledWith(1);
    });

    it('업무 규칙 에러는 정상적인 거부라서 호가창을 다시 만들지 않는다', async () => {
      tx.$queryRaw.mockResolvedValue(lockedAccountOf(0n, 0n));

      const error = await errorOf(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      );

      expect(error.error).toBe(OrderErrors.INSUFFICIENT_CASH);
      expect(matching.reloadBook).not.toHaveBeenCalled();
    });

    it('중복 요청(P2002)은 호가창을 다시 만들지 않는다', async () => {
      tx.order.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      order.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 100n,
        accountId: ACCOUNT_ID,
        stockId: 1,
        clientOrderId: CLIENT_ORDER_ID,
        side: OrderSide.BUY,
        orderType: OrderType.LIMIT,
        price: 5_000n,
        qty: 200n,
        filledQty: 0n,
        lockedAmount: 1_000_000n,
        status: OrderStatus.ACCEPTED,
        canceledDate: null,
        createDate: CREATE_DATE,
      });

      await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(matching.reloadBook).not.toHaveBeenCalled();
    });

    it('정산한 체결을 같은 트랜잭션에서 차트 봉에 반영한다', async () => {
      matching.match.mockReturnValue({
        selfTrade: false,
        fills,
        remainingQty: 120n,
      });
      const trade1 = { id: 101n };
      const trade2 = { id: 102n };
      settlement.settle.mockImplementation((_, created: object) =>
        Promise.resolve({
          order: created,
          trades: [{ trade: trade1 }, { trade: trade2 }],
        }),
      );

      await service.placeOrder(USER_ID, buyOf(5_000, 200));

      expect(charts.recordTrades).toHaveBeenCalledWith(tx, [trade1, trade2]);
      expect(charts.recordTrades.mock.invocationCallOrder[0]).toBeGreaterThan(
        settlement.settle.mock.invocationCallOrder[0],
      );
      expect(charts.recordTrades.mock.invocationCallOrder[0]).toBeLessThan(
        matching.apply.mock.invocationCallOrder[0],
      );
    });

    it('차트 봉 반영이 실패하면 주문 전체를 되돌리고 호가창에 반영하지 않는다', async () => {
      matching.match.mockReturnValue({
        selfTrade: false,
        fills,
        remainingQty: 120n,
      });
      charts.recordTrades.mockRejectedValueOnce(new Error('봉 갱신 실패'));

      await expect(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      ).rejects.toThrow('봉 갱신 실패');
      expect(matching.apply).not.toHaveBeenCalled();
      expect(matching.publishTrades).not.toHaveBeenCalled();
    });

    it('트랜잭션이 실패하면 호가창에 반영하지 않고 체결도 알리지 않는다', async () => {
      matching.match.mockReturnValue({
        selfTrade: false,
        fills,
        remainingQty: 120n,
      });
      settlement.settle.mockRejectedValue(new Error('정산 실패'));

      await expect(
        service.placeOrder(USER_ID, buyOf(5_000, 200)),
      ).rejects.toThrow('정산 실패');
      expect(matching.apply).not.toHaveBeenCalled();
      expect(matching.publishTrades).not.toHaveBeenCalled();
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
      order.findFirst.mockResolvedValue({ stockId: 1 });
      tx.order.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...orderRowOf(), ...data }),
      );
    });

    it('내 주문의 종목을 찾아 그 종목의 순서 안에서 취소한다', async () => {
      givenOrder();

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(order.findFirst).toHaveBeenCalledWith({
        where: { id: 100n, account: { userId: USER_ID } },
        select: { stockId: true },
      });
      expect(matching.runExclusive).toHaveBeenCalledWith(
        1,
        expect.any(Function),
      );
      expect(matching.runExclusive.mock.invocationCallOrder[0]).toBeLessThan(
        transaction.mock.invocationCallOrder[0],
      );
    });

    it('취소가 커밋되면 호가창에서 주문을 뺀다', async () => {
      givenOrder();

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(matching.removeOrder).toHaveBeenCalledWith(1, 100n);
      expect(matching.removeOrder.mock.invocationCallOrder[0]).toBeGreaterThan(
        tx.order.update.mock.invocationCallOrder[0],
      );
    });

    it('취소하지 못하면 호가창을 건드리지 않는다', async () => {
      givenOrder({
        status: OrderStatus.FILLED,
        filledQty: 10n,
        lockedAmount: 0n,
      });

      await errorOf(service.cancelOrder(USER_ID, ORDER_ID));

      expect(matching.removeOrder).not.toHaveBeenCalled();
    });

    it('이미 취소된 주문이면 호가창을 건드리지 않는다', async () => {
      givenOrder({
        status: OrderStatus.CANCELED,
        lockedAmount: 0n,
        canceledDate: new Date(),
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(matching.removeOrder).not.toHaveBeenCalled();
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
      order.findFirst.mockResolvedValue(null);

      const error = await errorOf(service.cancelOrder(USER_ID, ORDER_ID));

      expect(error.error).toBe(OrderErrors.NOT_FOUND);
      expect(matching.runExclusive).not.toHaveBeenCalled();
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

  describe('조회', () => {
    const orderWithStockOf = (
      id: bigint,
      overrides: Record<string, unknown> = {},
    ) => ({
      id,
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
      stock: { name: 'CloudWorks' },
      ...overrides,
    });
    const cursorOf = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    describe('getOrders', () => {
      it('미체결 주문을 최근 주문순으로 조회한다', async () => {
        order.findMany.mockResolvedValue([orderWithStockOf(5n)]);

        const result = await service.getOrders(USER_ID, {
          status: OrderListStatus.OPEN,
          size: 20,
        });

        expect(order.findMany).toHaveBeenCalledWith({
          where: {
            account: { userId: USER_ID },
            status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
          },
          include: { stock: { select: { name: true } } },
          orderBy: { id: 'desc' },
          take: 21,
        });
        expect(result).toEqual({
          items: [
            expect.objectContaining({
              orderId: 5,
              stockName: 'CloudWorks',
              avgFilledPrice: null,
            }),
          ],
          nextCursor: null,
        });
      });

      it.each([
        [
          OrderListStatus.DONE,
          { in: [OrderStatus.FILLED, OrderStatus.CANCELED] },
        ],
        [OrderListStatus.ALL, undefined],
      ])('%s는 해당 상태의 주문만 조회한다', async (status, expected) => {
        order.findMany.mockResolvedValue([]);

        await service.getOrders(USER_ID, { status, size: 20 });

        const [{ where }] = order.findMany.mock.calls[0] as [
          { where: { status?: unknown } },
        ];
        expect(where.status).toEqual(expected);
      });

      it('상품을 지정하면 그 상품의 주문만 조회한다', async () => {
        order.findMany.mockResolvedValue([]);

        await service.getOrders(USER_ID, {
          status: OrderListStatus.ALL,
          stockId: 3,
          size: 20,
        });

        expect(order.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { account: { userId: USER_ID }, stockId: 3 },
          }),
        );
      });

      it('다음 페이지가 있으면 마지막 주문 ID로 커서를 만든다', async () => {
        order.findMany.mockResolvedValue([
          orderWithStockOf(9n),
          orderWithStockOf(8n),
          orderWithStockOf(7n),
        ]);

        const result = await service.getOrders(USER_ID, {
          status: OrderListStatus.ALL,
          size: 2,
        });

        expect(result.items.map(({ orderId }) => orderId)).toEqual([9, 8]);
        expect(result.nextCursor).toBe(cursorOf({ orderId: 8 }));
      });

      it('커서를 넘기면 그보다 오래된 주문을 조회한다', async () => {
        order.findMany.mockResolvedValue([]);

        await service.getOrders(USER_ID, {
          status: OrderListStatus.ALL,
          cursor: cursorOf({ orderId: 8 }),
          size: 2,
        });

        expect(order.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { account: { userId: USER_ID }, id: { lt: 8n } },
          }),
        );
      });

      it.each(['not-base64-json', cursorOf({ orderId: 'x' }), cursorOf([])])(
        '잘못된 커서(%s)면 처음부터 다시 불러오게 한다',
        async (cursor) => {
          const error = await errorOf(
            service.getOrders(USER_ID, {
              status: OrderListStatus.ALL,
              cursor,
              size: 2,
            }),
          );

          expect(error.error).toBe(OrderErrors.INVALID_CURSOR);
        },
      );

      it('체결된 주문은 평균 체결가를 계산한다', async () => {
        order.findMany.mockResolvedValue([
          orderWithStockOf(5n, { filledQty: 3n, status: OrderStatus.PARTIAL }),
          orderWithStockOf(4n, {
            side: OrderSide.SELL,
            filledQty: 2n,
            status: OrderStatus.FILLED,
          }),
        ]);
        trade.findMany.mockResolvedValue([
          { buyOrderId: 5n, sellOrderId: 1n, price: 4_900n, qty: 1n },
          { buyOrderId: 5n, sellOrderId: 2n, price: 5_000n, qty: 2n },
          { buyOrderId: 3n, sellOrderId: 4n, price: 5_100n, qty: 2n },
        ]);

        const result = await service.getOrders(USER_ID, {
          status: OrderListStatus.ALL,
          size: 20,
        });

        expect(trade.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { buyOrderId: { in: [5n, 4n] } },
              { sellOrderId: { in: [5n, 4n] } },
            ],
          },
          select: {
            buyOrderId: true,
            sellOrderId: true,
            price: true,
            qty: true,
          },
        });
        // (4,900 × 1 + 5,000 × 2) / 3 = 4,966.666…
        expect(result.items[0].avgFilledPrice).toBe(4_966.67);
        expect(result.items[1].avgFilledPrice).toBe(5_100);
      });
    });

    describe('getOrder', () => {
      it('주문과 그 주문의 체결 내역을 체결순으로 돌려준다', async () => {
        order.findFirst.mockResolvedValue(
          orderWithStockOf(5n, { filledQty: 3n, status: OrderStatus.PARTIAL }),
        );
        const tradeDate = new Date('2026-10-24T01:05:00.000Z');
        trade.findMany.mockResolvedValue([
          {
            id: 21n,
            buyOrderId: 5n,
            sellOrderId: 1n,
            price: 4_900n,
            qty: 1n,
            createDate: tradeDate,
          },
          {
            id: 22n,
            buyOrderId: 5n,
            sellOrderId: 2n,
            price: 5_000n,
            qty: 2n,
            createDate: tradeDate,
          },
        ]);

        const result = await service.getOrder(USER_ID, 5);

        expect(order.findFirst).toHaveBeenCalledWith({
          where: { id: 5n, account: { userId: USER_ID } },
          include: { stock: { select: { name: true } } },
        });
        expect(trade.findMany).toHaveBeenCalledWith({
          where: { OR: [{ buyOrderId: 5n }, { sellOrderId: 5n }] },
          orderBy: { id: 'asc' },
        });
        expect(result).toMatchObject({
          orderId: 5,
          stockName: 'CloudWorks',
          avgFilledPrice: 4_966.67,
          trades: [
            { tradeId: 21, price: 4_900, qty: 1, createDate: tradeDate },
            { tradeId: 22, price: 5_000, qty: 2, createDate: tradeDate },
          ],
        });
      });

      it('없거나 다른 회원의 주문은 찾을 수 없다', async () => {
        order.findFirst.mockResolvedValue(null);

        const error = await errorOf(service.getOrder(USER_ID, 5));

        expect(error.error).toBe(OrderErrors.NOT_FOUND);
      });
    });

    describe('getOrderBook', () => {
      it('호가창에서 매도·매수 호가를 5단계까지 읽어 돌려준다', async () => {
        matching.depth.mockReturnValue({
          asks: [
            { price: 5_000n, qty: 7n },
            { price: 5_100n, qty: 2n },
          ],
          bids: [{ price: 4_900n, qty: 6n }],
        });

        const result = await service.getOrderBook(1);

        expect(stock.findFirst).toHaveBeenCalledWith({
          where: { id: 1, isDeleted: false },
          select: { id: true },
        });
        expect(matching.depth).toHaveBeenCalledWith(1, 5);
        expect(result).toEqual({
          stockId: 1,
          asks: [
            { price: 5_000, qty: 7 },
            { price: 5_100, qty: 2 },
          ],
          bids: [{ price: 4_900, qty: 6 }],
        });
      });

      it('없거나 삭제된 상품이면 조회할 수 없다', async () => {
        stock.findFirst.mockResolvedValue(null);

        const error = await errorOf(service.getOrderBook(1));

        expect(error.error).toBe(StockErrors.NOT_FOUND);
        expect(matching.depth).not.toHaveBeenCalled();
      });
    });

    describe('getAvailable', () => {
      beforeEach(() => {
        stock.findFirst.mockResolvedValue(
          stockOf({ priceTickSize: 10n, minOrderPrice: 100n, minOrderQty: 2n }),
        );
        account.findUnique.mockResolvedValue({
          id: ACCOUNT_ID,
          cash: 3_000_000n,
          lockedCash: 500_000n,
        });
      });

      it('주문 화면에 필요한 규칙과 사용 가능 포인트, 매도 가능 수량을 돌려준다', async () => {
        holding.findUnique.mockResolvedValue({ qty: 10n, lockedQty: 4n });

        const result = await service.getAvailable(USER_ID, 1);

        expect(account.findUnique).toHaveBeenCalledWith({
          where: { userId: USER_ID },
        });
        expect(holding.findUnique).toHaveBeenCalledWith({
          where: { accountId_stockId: { accountId: ACCOUNT_ID, stockId: 1 } },
        });
        expect(result).toEqual({
          stockId: 1,
          tradeStatus: TradeStatus.ACTIVE,
          priceTickSize: 10,
          minOrderPrice: 100,
          minOrderQty: 2,
          feeRate: 0.0002,
          availableCash: 2_500_000,
          sellableQty: 6,
        });
      });

      it('보유하지 않은 상품은 매도 가능 수량이 0이다', async () => {
        holding.findUnique.mockResolvedValue(null);

        const result = await service.getAvailable(USER_ID, 1);

        expect(result.sellableQty).toBe(0);
      });

      it('없거나 삭제된 상품이면 조회할 수 없다', async () => {
        stock.findFirst.mockResolvedValue(null);

        const error = await errorOf(service.getAvailable(USER_ID, 1));

        expect(error.error).toBe(StockErrors.NOT_FOUND);
      });

      it('계좌가 없으면 조회할 수 없다', async () => {
        account.findUnique.mockResolvedValue(null);

        const error = await errorOf(service.getAvailable(USER_ID, 1));

        expect(error.error).toBe(AccountErrors.NOT_FOUND);
      });
    });
  });
});
