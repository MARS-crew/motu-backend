import { Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AnomalyStatus,
  AnomalyType,
  OrderSide,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  MatchingService,
  OrderAcceptedEvent,
  OrderFailedEvent,
  TradeExecutedEvent,
} from '../matching/matching.service.js';
import { AnomalyDetectorService } from './anomaly-detector.service.js';

const STOCK_ID = 18;
const NOW = new Date('2026-09-03T10:42:00.000Z');

describe('AnomalyDetectorService', () => {
  const prisma = {
    anomaly: { create: vi.fn(), findFirst: vi.fn() },
    order: { findUniqueOrThrow: vi.fn(), count: vi.fn() },
    stock: { findUniqueOrThrow: vi.fn() },
    trade: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  };
  let service: AnomalyDetectorService;

  /** 잔액이 맞는 계좌 행 */
  const balanceOf = (overrides: Record<string, unknown> = {}) => ({
    user_id: 1024,
    cash: 3_000_000n,
    locked_cash: 100_000n,
    expected_locked_cash: 100_000n,
    qty: 50n,
    locked_qty: 10n,
    expected_locked_qty: 10n,
    ...overrides,
  });

  const tradeOf = (
    overrides: Partial<TradeExecutedEvent> = {},
  ): TradeExecutedEvent => ({
    tradeId: 9032201n,
    stockId: STOCK_ID,
    buyOrderId: 9031842n,
    sellOrderId: 9031000n,
    buyAccountId: 11,
    sellAccountId: 22,
    price: 18_900n,
    qty: 8_000n,
    createDate: NOW,
    ...overrides,
  });

  const orderOf = (
    overrides: Partial<OrderAcceptedEvent> = {},
  ): OrderAcceptedEvent => ({
    orderId: 9031842n,
    stockId: STOCK_ID,
    accountId: 11,
    userId: 1024,
    side: OrderSide.BUY,
    price: 12_500n,
    qty: 10n,
    createDate: NOW,
    ...overrides,
  });

  const createdData = () =>
    prisma.anomaly.create.mock.calls.map(
      ([arg]) => (arg as { data: Record<string, unknown> }).data,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnomalyDetectorService(
      prisma as unknown as PrismaService,
      {
        tradeExecuted$: new Subject(),
        orderAccepted$: new Subject(),
        orderFailed$: new Subject(),
      } as unknown as MatchingService,
    );
    prisma.trade.findFirst.mockResolvedValue({ price: 12_480n });
    prisma.order.findUniqueOrThrow.mockResolvedValue({
      qty: 8_000n,
      account: { userId: 1024 },
    });
    prisma.stock.findUniqueOrThrow.mockResolvedValue({
      listedShares: 100_000n,
      basePrice: 12_000n,
    });
    prisma.order.count.mockResolvedValue(1);
    prisma.anomaly.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([balanceOf()]);
  });

  describe('비정상 가격 체결', () => {
    it('직전 체결가에서 30%를 넘게 벗어나면 새로 들어온 주문 기준으로 남긴다', async () => {
      await service.handleTrade(tradeOf());

      expect(prisma.trade.findFirst).toHaveBeenCalledWith({
        where: { stockId: STOCK_ID, id: { lt: 9032201n } },
        orderBy: { id: 'desc' },
        select: { price: true },
      });
      // 매수 주문 ID가 커서 매수가 새로 들어온 주문이다.
      expect(prisma.order.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 9031842n },
        select: { qty: true, account: { select: { userId: true } } },
      });
      expect(createdData()).toEqual([
        {
          type: AnomalyType.ABNORMAL_PRICE,
          userId: 1024,
          stockId: STOCK_ID,
          orderId: 9031842n,
          tradeId: 9032201n,
          errorCode: 'PRICE_DEVIATION',
          errorMessage: '가격 편차 초과',
          evidence: {
            orderQty: 8000,
            filledQty: 8000,
            basePrice: 12480,
            tradePrice: 18900,
            deviationPercent: 51.44,
            assetDifference: -51360000,
          },
        },
      ]);
    });

    it('정확히 30%까지는 정상으로 본다', async () => {
      prisma.trade.findFirst.mockResolvedValue({ price: 10_000n });

      await service.handleTrade(tradeOf({ price: 13_000n }));
      await service.handleTrade(tradeOf({ tradeId: 9032202n, price: 9_100n }));

      expect(prisma.anomaly.create).not.toHaveBeenCalled();
    });

    it('직전 체결가는 메모리에 이어 받아 다음 체결과 비교한다', async () => {
      prisma.trade.findFirst.mockResolvedValue({ price: 10_000n });

      await service.handleTrade(tradeOf({ price: 12_000n }));
      // 직전 12,000 → 7,000 (-41.6%)
      await service.handleTrade(tradeOf({ tradeId: 9032202n, price: 7_000n }));

      expect(prisma.trade.findFirst).toHaveBeenCalledTimes(1);
      expect(createdData()).toEqual([
        expect.objectContaining({
          tradeId: 9032202n,
          evidence: expect.objectContaining({
            basePrice: 12000,
            tradePrice: 7000,
            deviationPercent: -41.66,
          }),
        }),
      ]);
    });

    it('체결이 처음이면 상장가를 직전 가격으로 본다', async () => {
      prisma.trade.findFirst.mockResolvedValue(null);

      await service.handleTrade(tradeOf({ price: 16_000n }));

      expect(createdData()).toEqual([
        expect.objectContaining({
          evidence: expect.objectContaining({ basePrice: 12000 }),
        }),
      ]);
    });

    it('매도 주문이 새로 들어온 주문이면 매도 쪽을 원인으로 본다', async () => {
      await service.handleTrade(
        tradeOf({ buyOrderId: 9031000n, sellOrderId: 9031842n }),
      );

      expect(prisma.order.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 9031842n } }),
      );
    });

    it('같은 체결을 이미 남겼으면(P2002) 에러 없이 넘어간다', async () => {
      prisma.anomaly.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.handleTrade(tradeOf())).resolves.toBeUndefined();
    });
  });

  describe('대량 주문', () => {
    it('발행량의 1% 이상이면 남긴다', async () => {
      await service.handleOrderAccepted(orderOf({ qty: 1_000n }));

      expect(createdData()).toEqual([
        {
          type: AnomalyType.LARGE_ORDER,
          userId: 1024,
          stockId: STOCK_ID,
          orderId: 9031842n,
          tradeId: null,
          errorCode: 'LARGE_ORDER',
          errorMessage: '대량 주문 탐지',
          evidence: {
            side: OrderSide.BUY,
            orderPrice: 12500,
            orderQty: 1000,
            listedShares: 100000,
            sharePercent: 1,
            thresholdPercent: 1,
          },
        },
      ]);
    });

    it('1% 미만이면 남기지 않는다', async () => {
      await service.handleOrderAccepted(orderOf({ qty: 999n }));

      expect(prisma.anomaly.create).not.toHaveBeenCalled();
    });
  });

  describe('반복 주문', () => {
    it('같은 상품에 1분 안에 10건 이상이면 남긴다', async () => {
      prisma.order.count.mockResolvedValue(10);

      await service.handleOrderAccepted(orderOf());

      expect(prisma.order.count).toHaveBeenCalledWith({
        where: {
          accountId: 11,
          stockId: STOCK_ID,
          createDate: {
            gt: new Date('2026-09-03T10:41:00.000Z'),
            lte: NOW,
          },
        },
      });
      expect(prisma.anomaly.findFirst).toHaveBeenCalledWith({
        where: {
          type: AnomalyType.REPEATED_ORDER,
          userId: 1024,
          stockId: STOCK_ID,
          detectedDate: { gt: new Date('2026-09-03T10:32:00.000Z') },
        },
        select: { id: true },
      });
      expect(createdData()).toEqual([
        expect.objectContaining({
          type: AnomalyType.REPEATED_ORDER,
          errorCode: 'REPEATED_ORDER',
          evidence: expect.objectContaining({
            orderCount: 10,
            windowSeconds: 60,
            minCount: 10,
          }),
        }),
      ]);
    });

    it('9건이면 남기지 않는다', async () => {
      prisma.order.count.mockResolvedValue(9);

      await service.handleOrderAccepted(orderOf());

      expect(prisma.anomaly.create).not.toHaveBeenCalled();
    });

    it('10분 안에 같은 회원·상품으로 남긴 반복 주문이 있으면 다시 남기지 않는다', async () => {
      prisma.order.count.mockResolvedValue(15);
      prisma.anomaly.findFirst.mockResolvedValue({ id: 3 });

      await service.handleOrderAccepted(orderOf());

      expect(prisma.anomaly.create).not.toHaveBeenCalled();
    });
  });

  describe('잔액 불일치', () => {
    it('예약 포인트가 미체결 매수 주문의 예약 합과 다르면 상품 없이 남긴다', async () => {
      prisma.$queryRaw.mockResolvedValue([
        balanceOf({ locked_cash: 150_000n }),
      ]);

      await service.handleOrderAccepted(orderOf());

      expect(prisma.anomaly.findFirst).toHaveBeenCalledWith({
        where: {
          type: AnomalyType.BALANCE_MISMATCH,
          userId: 1024,
          stockId: null,
          errorCode: 'LOCKED_CASH_MISMATCH',
          status: { not: AnomalyStatus.RESOLVED },
        },
        select: { id: true },
      });
      expect(createdData()).toEqual([
        {
          type: AnomalyType.BALANCE_MISMATCH,
          userId: 1024,
          stockId: null,
          orderId: null,
          tradeId: null,
          errorCode: 'LOCKED_CASH_MISMATCH',
          errorMessage: '예약 포인트 불일치',
          evidence: {
            item: 'CASH',
            cash: 3000000,
            lockedCash: 150000,
            expectedLockedCash: 100000,
            difference: 50000,
          },
        },
      ]);
    });

    it('예약 포인트가 보유 포인트보다 많아도 불일치다', async () => {
      prisma.$queryRaw.mockResolvedValue([
        balanceOf({
          cash: 50_000n,
          locked_cash: 100_000n,
          expected_locked_cash: 100_000n,
        }),
      ]);

      await service.handleOrderAccepted(orderOf());

      expect(createdData()).toEqual([
        expect.objectContaining({ errorCode: 'LOCKED_CASH_MISMATCH' }),
      ]);
    });

    it('예약 수량이 미체결 매도 주문의 남은 수량 합과 다르면 그 상품으로 남긴다', async () => {
      prisma.$queryRaw.mockResolvedValue([balanceOf({ locked_qty: 7n })]);

      await service.handleOrderAccepted(orderOf());

      expect(createdData()).toEqual([
        expect.objectContaining({
          stockId: STOCK_ID,
          errorCode: 'LOCKED_QTY_MISMATCH',
          errorMessage: '예약 수량 불일치',
          evidence: {
            item: 'QTY',
            qty: 50,
            lockedQty: 7,
            expectedLockedQty: 10,
            difference: -3,
          },
        }),
      ]);
    });

    it('보유가 없는데 미체결 매도 주문이 있으면 불일치다', async () => {
      prisma.$queryRaw.mockResolvedValue([
        balanceOf({ qty: null, locked_qty: null, expected_locked_qty: 5n }),
      ]);

      await service.handleOrderAccepted(orderOf());

      expect(createdData()).toEqual([
        expect.objectContaining({ errorCode: 'LOCKED_QTY_MISMATCH' }),
      ]);
    });

    it('처리 전인 같은 불일치가 있으면 다시 남기지 않는다', async () => {
      prisma.$queryRaw.mockResolvedValue([
        balanceOf({ locked_cash: 150_000n }),
      ]);
      prisma.anomaly.findFirst.mockResolvedValue({ id: 5 });

      await service.handleOrderAccepted(orderOf());

      expect(prisma.anomaly.create).not.toHaveBeenCalled();
    });

    it('체결에서는 호가창에 있던 주문(주문 ID가 작은 쪽)의 계좌를 확인한다', async () => {
      prisma.trade.findFirst.mockResolvedValue({ price: 18_900n });

      await service.handleTrade(tradeOf());

      const [, ...values] = prisma.$queryRaw.mock.calls[0] as unknown[];
      // 매도 주문 ID가 작아 매도 계좌(22)가 호가창에 있던 계좌다.
      expect(values).toEqual([STOCK_ID, STOCK_ID, 22]);
    });
  });

  describe('주문 처리 실패', () => {
    const failedOf = (error: unknown): OrderFailedEvent => ({
      stockId: STOCK_ID,
      userId: 335,
      side: OrderSide.SELL,
      price: 12_000n,
      qty: 3n,
      error,
      failedDate: NOW,
    });

    it('에러 이름·코드·메시지를 근거로 남긴다', async () => {
      await service.handleOrderFailed(
        failedOf(
          new Prisma.PrismaClientKnownRequestError('Transaction timeout', {
            code: 'P2028',
            clientVersion: 'test',
          }),
        ),
      );

      expect(createdData()).toEqual([
        {
          type: AnomalyType.ORDER_FAILURE,
          userId: 335,
          stockId: STOCK_ID,
          orderId: null,
          tradeId: null,
          errorCode: 'ORDER_FAILED',
          errorMessage: '주문 처리 실패',
          evidence: {
            side: OrderSide.SELL,
            orderPrice: 12000,
            orderQty: 3,
            errorName: 'PrismaClientKnownRequestError',
            errorCode: 'P2028',
            errorMessage: 'Transaction timeout',
            failedDate: NOW.toISOString(),
          },
        },
      ]);
    });
  });

  it('탐지 중 에러가 나도 던지지 않는다 (주문·체결에 영향 없음)', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.stock.findUniqueOrThrow.mockRejectedValue(new Error('db down'));
    prisma.trade.findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      service.handleOrderAccepted(orderOf()),
    ).resolves.toBeUndefined();
    await expect(service.handleTrade(tradeOf())).resolves.toBeUndefined();
  });

  it('구독한 이벤트는 종목별 순서대로 처리한다', async () => {
    const trades = new Subject<TradeExecutedEvent>();
    const orders = new Subject<OrderAcceptedEvent>();
    const subscribed = new AnomalyDetectorService(
      prisma as unknown as PrismaService,
      {
        tradeExecuted$: trades.asObservable(),
        orderAccepted$: orders.asObservable(),
        orderFailed$: new Subject().asObservable(),
      } as unknown as MatchingService,
    );
    const handled: string[] = [];
    vi.spyOn(subscribed, 'handleTrade').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      handled.push('trade');
    });
    vi.spyOn(subscribed, 'handleOrderAccepted').mockImplementation(async () => {
      handled.push('order');
    });
    subscribed.onModuleInit();

    trades.next(tradeOf());
    orders.next(orderOf());
    await new Promise((resolve) => setTimeout(resolve, 20));
    subscribed.onModuleDestroy();

    expect(handled).toEqual(['trade', 'order']);
  });
});
