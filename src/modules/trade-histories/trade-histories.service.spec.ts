import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderSide,
  OrderStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  OpenOrderSort,
  TradeHistorySort,
} from './trade-histories.constants.js';
import { TradeHistoriesService } from './trade-histories.service.js';

describe('TradeHistoriesService', () => {
  const account = { findUnique: vi.fn() };
  const $queryRaw = vi.fn();
  const prisma = { account, $queryRaw } as unknown as PrismaService;
  const service = new TradeHistoriesService(prisma);

  // 한국 시간 2026-10-28 09:00
  const now = new Date('2026-10-28T00:00:00.000Z');
  const tradedAt = new Date('2026-10-27T05:32:00.000Z');

  /** n번째 $queryRaw 호출의 SQL 값 목록 */
  const valuesOf = (call: number): unknown[] =>
    ($queryRaw.mock.calls[call] as [TemplateStringsArray, ...unknown[]])
      .slice(1)
      .flatMap((value) =>
        value instanceof Prisma.Sql ? value.values : [value],
      );

  beforeEach(() => {
    vi.clearAllMocks();
    account.findUnique.mockResolvedValue({ id: 3, lastPointResetAt: null });
  });

  describe('조회 기간', () => {
    it('비우면 이번 달 1일 00시 ~ 오늘 24시(한국 시간)로 조회한다', async () => {
      $queryRaw.mockResolvedValue([{ buy_amount: 0n, sell_amount: 0n }]);

      const result = await service.getSummary(7, {}, now);

      expect(result).toMatchObject({ from: '2026-10-01', to: '2026-10-28' });
      expect(valuesOf(0)).toEqual([
        3,
        new Date('2026-09-30T15:00:00.000Z'),
        new Date('2026-10-28T15:00:00.000Z'),
      ]);
    });

    it('한국 날짜로 오늘을 정한다 (UTC로는 전날이어도)', async () => {
      $queryRaw.mockResolvedValue([{ buy_amount: 0n, sell_amount: 0n }]);

      // UTC 10-31 16:00 = 한국 11-01 01:00
      const result = await service.getSummary(
        7,
        {},
        new Date('2026-10-31T16:00:00.000Z'),
      );

      expect(result).toMatchObject({ from: '2026-11-01', to: '2026-11-01' });
    });

    it('시작일이 종료일보다 늦으면 거부한다', async () => {
      await expect(
        service.getSummary(7, { from: '2026-10-10', to: '2026-10-01' }, now),
      ).rejects.toMatchObject({
        response: { code: 'TRADE_HISTORY_INVALID_PERIOD' },
      });
      expect($queryRaw).not.toHaveBeenCalled();
    });

    it('포인트 리셋 이후 거래만 조회한다', async () => {
      const resetAt = new Date('2026-10-20T00:00:00.000Z');
      account.findUnique.mockResolvedValue({
        id: 3,
        lastPointResetAt: resetAt,
      });
      $queryRaw.mockResolvedValue([{ buy_amount: 0n, sell_amount: 0n }]);

      await service.getSummary(7, {}, now);

      expect(valuesOf(0)).toContainEqual(resetAt);
    });

    it('계좌가 없으면 404', async () => {
      account.findUnique.mockResolvedValue(null);

      await expect(service.getSummary(7, {}, now)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_NOT_FOUND' },
      });
    });
  });

  it('거래 요약은 매수·매도 거래금액과 합계를 내려준다', async () => {
    $queryRaw.mockResolvedValue([
      { buy_amount: 650_000n, sell_amount: 600_340n },
    ]);

    const result = await service.getSummary(
      7,
      { from: '2026-09-01', to: '2026-09-06' },
      now,
    );

    expect(result).toEqual({
      from: '2026-09-01',
      to: '2026-09-06',
      totalAmount: 1_250_340,
      buyAmount: 650_000,
      sellAmount: 600_340,
    });
  });

  it('거래내역은 체결 한 건씩 페이지로 내려준다', async () => {
    $queryRaw
      .mockResolvedValueOnce([
        {
          trade_id: 104n,
          create_date: tradedAt,
          order_id: 30n,
          stock_id: 1,
          stock_name: 'PLI',
          side: OrderSide.BUY,
          price: 9_300n,
          qty: 10n,
          amount: 93_000n,
          fee: 18n,
        },
      ])
      .mockResolvedValueOnce([{ count: 11n }]);

    const result = await service.getTradeHistories(
      7,
      { page: 2, size: 10, sort: TradeHistorySort.AMOUNT },
      now,
    );

    expect(valuesOf(0).slice(-2)).toEqual([10, 10]);
    expect(result).toEqual({
      from: '2026-10-01',
      to: '2026-10-28',
      page: 2,
      size: 10,
      totalCount: 11,
      items: [
        {
          tradeId: 104,
          tradedAt,
          orderId: 30,
          stockId: 1,
          stockName: 'PLI',
          side: OrderSide.BUY,
          price: 9_300,
          qty: 10,
          amount: 93_000,
          fee: 18,
        },
      ],
    });
  });

  it('체결주문은 주문별 체결 수량·금액을 내려준다', async () => {
    $queryRaw
      .mockResolvedValueOnce([
        {
          order_id: 30n,
          stock_id: 1,
          stock_name: 'PLI',
          side: OrderSide.BUY,
          order_price: 9_300n,
          order_qty: 50n,
          status: OrderStatus.PARTIAL,
          filled_qty: 20n,
          filled_amount: 186_000n,
          fee: 37n,
          filled_at: tradedAt,
        },
      ])
      .mockResolvedValueOnce([{ count: 1n }]);

    const result = await service.getFilledOrders(
      7,
      { page: 1, size: 10, sort: TradeHistorySort.LATEST },
      now,
    );

    expect(result.totalCount).toBe(1);
    expect(result.items).toEqual([
      {
        orderId: 30,
        stockId: 1,
        stockName: 'PLI',
        side: OrderSide.BUY,
        orderPrice: 9_300,
        orderQty: 50,
        filledQty: 20,
        filledAmount: 186_000,
        fee: 37,
        status: OrderStatus.PARTIAL,
        filledAt: tradedAt,
      },
    ]);
  });

  it('미체결주문은 최초 주문 수량과 남은 수량을 내려준다', async () => {
    $queryRaw
      .mockResolvedValueOnce([
        {
          order_id: 31n,
          stock_id: 2,
          stock_name: 'TRIP',
          side: OrderSide.SELL,
          price: 10_500n,
          qty: 30n,
          filled_qty: 10n,
          order_amount: 315_000n,
          status: OrderStatus.PARTIAL,
          create_date: tradedAt,
        },
      ])
      .mockResolvedValueOnce([{ count: 1n }]);

    const result = await service.getOpenOrders(
      7,
      { page: 1, size: 10, sort: OpenOrderSort.LATEST },
      now,
    );

    expect(result.items).toEqual([
      {
        orderId: 31,
        stockId: 2,
        stockName: 'TRIP',
        side: OrderSide.SELL,
        price: 10_500,
        qty: 30,
        filledQty: 10,
        remainingQty: 20,
        orderAmount: 315_000,
        status: OrderStatus.PARTIAL,
        orderedAt: tradedAt,
      },
    ]);
  });
});
