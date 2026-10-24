import {
  CashLedgerType,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
} from '../../generated/prisma/client.js';
import { calculateFillAmounts, SettlementService } from './settlement.js';

describe('calculateFillAmounts', () => {
  // 매수 주문: 5,000P × 10주, 수수료 0.15% → 예약 50,075P
  const buyOrder = {
    price: 5_000n,
    qty: 10n,
    filledQty: 0n,
    lockedAmount: 50_075n,
  };
  // 매도자 보유: 10주, 총 매입금액 45,000P (평균 4,500P)
  const sellHolding = { qty: 10n, totalAmount: 45_000n };

  it('체결 금액과 양쪽 수수료를 계산한다', () => {
    const result = calculateFillAmounts(
      { price: 4_900n, qty: 4n, buyOrder, sellHolding },
      15n,
    );

    // 4,900 × 4 = 19,600, 수수료 29.4 → 29
    expect(result).toMatchObject({
      notional: 19_600n,
      buyFee: 29n,
      sellFee: 29n,
      buyerCost: 19_629n,
      sellerProceeds: 19_571n,
    });
  });

  it('일부 체결이면 주문 가격 기준으로 체결 수량만큼 예약을 푼다', () => {
    const result = calculateFillAmounts(
      { price: 4_900n, qty: 4n, buyOrder, sellHolding },
      15n,
    );

    // 5,000 × 4 = 20,000 + 수수료 30 = 20,030. 실제 비용 19,629와의 차액 401은 사용 가능 포인트로 돌아간다.
    expect(result.buyRelease).toBe(20_030n);
  });

  it('마지막 체결이면 남은 예약을 모두 푼다', () => {
    const result = calculateFillAmounts(
      {
        price: 5_000n,
        qty: 6n,
        buyOrder: { ...buyOrder, filledQty: 4n, lockedAmount: 30_045n },
        sellHolding,
      },
      15n,
    );

    expect(result.buyRelease).toBe(30_045n);
  });

  it('매도한 수량만큼의 매입원가와 실현손익을 계산한다', () => {
    const result = calculateFillAmounts(
      { price: 4_900n, qty: 4n, buyOrder, sellHolding },
      15n,
    );

    // 매입원가 45,000 × 4 / 10 = 18,000, 실현손익 19,571 - 18,000 = 1,571
    expect(result.costBasis).toBe(18_000n);
    expect(result.realizedPnl).toBe(1_571n);
  });

  it('매입원가의 원 단위 미만은 버린다', () => {
    const result = calculateFillAmounts(
      {
        price: 4_900n,
        qty: 1n,
        buyOrder,
        sellHolding: { qty: 3n, totalAmount: 10_000n },
      },
      0n,
    );

    // 10,000 / 3 = 3,333.33…
    expect(result.costBasis).toBe(3_333n);
    expect(result.realizedPnl).toBe(1_567n);
  });

  it('보유 수량을 모두 팔면 남은 매입금액 전체가 매입원가다', () => {
    const result = calculateFillAmounts(
      {
        price: 4_900n,
        qty: 3n,
        buyOrder,
        sellHolding: { qty: 3n, totalAmount: 10_000n },
      },
      0n,
    );

    expect(result.costBasis).toBe(10_000n);
  });

  it('손실이면 실현손익이 음수다', () => {
    const result = calculateFillAmounts(
      {
        price: 4_000n,
        qty: 10n,
        buyOrder: { ...buyOrder, price: 4_000n, lockedAmount: 40_000n },
        sellHolding,
      },
      0n,
    );

    expect(result.realizedPnl).toBe(-5_000n);
  });

  it('수수료율을 넘기지 않으면 현재 수수료율(0.02%)을 쓴다', () => {
    const result = calculateFillAmounts({
      price: 4_900n,
      qty: 4n,
      buyOrder: { ...buyOrder, lockedAmount: 50_010n },
      sellHolding,
    });

    // 4,900 × 4 = 19,600, 수수료 3.92 → 3. 예약 해제는 5,000 × 4 + 수수료 4
    expect(result).toMatchObject({
      buyFee: 3n,
      sellFee: 3n,
      buyerCost: 19_603n,
      buyRelease: 20_004n,
    });
  });
});

describe('SettlementService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    order: { findMany: vi.fn(), update: vi.fn() },
    holding: {
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    trade: { create: vi.fn() },
    account: { update: vi.fn() },
    cashLedger: { create: vi.fn() },
  };
  const client = tx as unknown as Prisma.TransactionClient;
  const service = new SettlementService();
  const STOCK_ID = 1;

  const orderOf = (overrides: Partial<Order>): Order => ({
    id: 0n,
    accountId: 0,
    stockId: STOCK_ID,
    clientOrderId: '3f2a9c1e-8b7d-4c5e-9f10-2a3b4c5d6e7f',
    side: OrderSide.BUY,
    orderType: OrderType.LIMIT,
    price: 0n,
    qty: 0n,
    filledQty: 0n,
    lockedAmount: 0n,
    status: OrderStatus.ACCEPTED,
    canceledDate: null,
    createDate: new Date(),
    modifiedDate: new Date(),
    ...overrides,
  });

  let tradeId = 0n;
  beforeEach(() => {
    vi.clearAllMocks();
    tradeId = 100n;
    tx.trade.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: (tradeId += 1n), createDate: new Date(), ...data }),
    );
    tx.account.update.mockResolvedValue({ cash: 999n });
    tx.order.update.mockImplementation(({ where, data }) =>
      Promise.resolve({ id: where.id, ...data }),
    );
  });

  describe('lockAccounts', () => {
    it('관련 계좌를 중복 없이 account_id 오름차순으로 잠근다', async () => {
      await service.lockAccounts(client, [3, 1, 3, 2]);

      const [sql, joined] = tx.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        { values: unknown[] },
      ];
      expect(sql.join('?')).toMatch(/ORDER BY account_id\s+FOR UPDATE/);
      expect(joined.values).toEqual([1, 2, 3]);
    });
  });

  describe('settle', () => {
    it('체결이 없으면 아무것도 바꾸지 않는다', async () => {
      const taker = orderOf({ id: 20n });

      const result = await service.settle(client, taker, []);

      expect(result).toEqual({ order: taker, trades: [] });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    describe('매수 주문이 매도 호가 두 개와 체결될 때', () => {
      // 새 매수 주문: 5,000P × 5주 (예약 25,000P + 수수료 5P)
      const taker = orderOf({
        id: 20n,
        accountId: 1,
        side: OrderSide.BUY,
        price: 5_000n,
        qty: 5n,
        lockedAmount: 25_005n,
      });
      // 계좌 2: 4,900P에 3주 매도 (보유 3주, 매입금액 12,000P → 전부 매도)
      const maker11 = orderOf({
        id: 11n,
        accountId: 2,
        side: OrderSide.SELL,
        price: 4_900n,
        qty: 3n,
      });
      // 계좌 3: 5,000P에 4주 매도 (보유 10주, 매입금액 45,000P → 2주만 체결)
      const maker12 = orderOf({
        id: 12n,
        accountId: 3,
        side: OrderSide.SELL,
        price: 5_000n,
        qty: 4n,
      });
      const fills = [
        { makerOrderId: 11n, makerAccountId: 2, price: 4_900n, qty: 3n },
        { makerOrderId: 12n, makerAccountId: 3, price: 5_000n, qty: 2n },
      ];

      beforeEach(() => {
        // settle이 조회한 주문 객체를 고쳐 쓰므로 매번 새 객체를 돌려준다.
        tx.order.findMany.mockImplementation(() =>
          Promise.resolve([{ ...maker11 }, { ...maker12 }]),
        );
        tx.holding.findUniqueOrThrow.mockImplementation(({ where }) =>
          Promise.resolve(
            where.accountId_stockId.accountId === 2
              ? {
                  id: 52,
                  accountId: 2,
                  qty: 3n,
                  lockedQty: 3n,
                  totalAmount: 12_000n,
                }
              : {
                  id: 53,
                  accountId: 3,
                  qty: 10n,
                  lockedQty: 4n,
                  totalAmount: 45_000n,
                },
          ),
        );
      });

      it('호가창 주문을 잠그고 체결 기록을 체결 순서대로 남긴다', async () => {
        await service.settle(client, taker, fills);

        const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
        expect(sql.join('?')).toMatch(/FROM orders[\s\S]*FOR UPDATE/);
        expect(tx.trade.create.mock.calls.map(([{ data }]) => data)).toEqual([
          {
            stockId: 1,
            buyOrderId: 20n,
            sellOrderId: 11n,
            price: 4_900n,
            qty: 3n,
          },
          {
            stockId: 1,
            buyOrderId: 20n,
            sellOrderId: 12n,
            price: 5_000n,
            qty: 2n,
          },
        ]);
      });

      it('매수자는 체결 금액을 내고, 일부 체결은 주문 가격 기준으로, 마지막 체결은 남은 예약을 모두 푼다', async () => {
        await service.settle(client, taker, fills);

        const buyerUpdates = tx.account.update.mock.calls
          .map(([args]) => args)
          .filter(({ where }) => where.id === 1);
        // 4,900 × 3 = 14,700 + 수수료 2, 예약 해제 5,000 × 3 + 수수료 3
        // 마지막 체결: 5,000 × 2 = 10,000 + 수수료 2, 남은 예약 25,005 - 15,003 = 10,002를 모두 해제
        expect(buyerUpdates).toEqual([
          {
            where: { id: 1 },
            data: {
              cash: { decrement: 14_702n },
              lockedCash: { decrement: 15_003n },
              version: { increment: 1 },
            },
          },
          {
            where: { id: 1 },
            data: {
              cash: { decrement: 10_002n },
              lockedCash: { decrement: 10_002n },
              version: { increment: 1 },
            },
          },
        ]);
      });

      it('매수자의 보유 수량과 매입금액을 늘린다', async () => {
        await service.settle(client, taker, fills);

        expect(tx.holding.upsert).toHaveBeenNthCalledWith(1, {
          where: { accountId_stockId: { accountId: 1, stockId: 1 } },
          create: { accountId: 1, stockId: 1, qty: 3n, totalAmount: 14_702n },
          update: {
            qty: { increment: 3n },
            totalAmount: { increment: 14_702n },
          },
        });
      });

      it('매도자는 체결 금액을 받고, 판 수량만큼 보유와 매입금액을 줄인다', async () => {
        await service.settle(client, taker, fills);

        expect(tx.account.update).toHaveBeenCalledWith({
          where: { id: 3 },
          data: { cash: { increment: 9_998n }, version: { increment: 1 } },
        });
        expect(tx.holding.update).toHaveBeenCalledWith({
          where: { id: 53 },
          data: {
            qty: { decrement: 2n },
            lockedQty: { decrement: 2n },
            totalAmount: { decrement: 9_000n },
          },
        });
      });

      it('보유 수량을 모두 판 매도자는 보유 행을 지운다', async () => {
        await service.settle(client, taker, fills);

        expect(tx.holding.delete).toHaveBeenCalledWith({ where: { id: 52 } });
        expect(tx.holding.update).not.toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 52 } }),
        );
      });

      it('포인트 내역에 체결, 수수료, 실현손익, 반영 후 잔액을 남긴다', async () => {
        await service.settle(client, taker, fills);

        expect(
          tx.cashLedger.create.mock.calls.map(([{ data }]) => data),
        ).toEqual([
          {
            accountId: 1,
            tradeId: 101n,
            type: CashLedgerType.BUY,
            amount: -14_702n,
            fee: 2n,
            balanceAfter: 999n,
          },
          {
            accountId: 2,
            tradeId: 101n,
            type: CashLedgerType.SELL,
            amount: 14_698n,
            fee: 2n,
            realizedPnl: 2_698n,
            balanceAfter: 999n,
          },
          {
            accountId: 1,
            tradeId: 102n,
            type: CashLedgerType.BUY,
            amount: -10_002n,
            fee: 2n,
            balanceAfter: 999n,
          },
          {
            accountId: 3,
            tradeId: 102n,
            type: CashLedgerType.SELL,
            amount: 9_998n,
            fee: 2n,
            realizedPnl: 998n,
            balanceAfter: 999n,
          },
        ]);
      });

      it('양쪽 주문의 체결 수량, 예약, 상태를 갱신하고 체결 정보를 돌려준다', async () => {
        const result = await service.settle(client, taker, fills);

        expect(tx.order.update.mock.calls.map(([args]) => args)).toEqual([
          {
            where: { id: 11n },
            data: {
              filledQty: 3n,
              lockedAmount: 0n,
              status: OrderStatus.FILLED,
            },
          },
          {
            where: { id: 12n },
            data: {
              filledQty: 2n,
              lockedAmount: 0n,
              status: OrderStatus.PARTIAL,
            },
          },
          {
            where: { id: 20n },
            data: {
              filledQty: 5n,
              lockedAmount: 0n,
              status: OrderStatus.FILLED,
            },
          },
        ]);
        expect(result.order).toMatchObject({
          id: 20n,
          status: OrderStatus.FILLED,
        });
        expect(result.trades).toEqual([
          {
            trade: expect.objectContaining({ id: 101n }),
            buyAccountId: 1,
            sellAccountId: 2,
          },
          {
            trade: expect.objectContaining({ id: 102n }),
            buyAccountId: 1,
            sellAccountId: 3,
          },
        ]);
      });
    });

    it('매도 주문이 매수 호가와 일부 체결되면 상대 매수 주문의 예약을 줄이고 새 주문은 일부 체결로 남는다', async () => {
      // 새 매도 주문: 4,900P × 5주. 계좌 3의 매수 주문 5,000P × 3주(예약 15,000P + 수수료 3P)와 3주 체결
      const taker = orderOf({
        id: 20n,
        accountId: 1,
        side: OrderSide.SELL,
        price: 4_900n,
        qty: 5n,
      });
      const maker = orderOf({
        id: 11n,
        accountId: 3,
        side: OrderSide.BUY,
        price: 5_000n,
        qty: 3n,
        lockedAmount: 15_003n,
      });
      tx.order.findMany.mockResolvedValue([maker]);
      tx.holding.findUniqueOrThrow.mockResolvedValue({
        id: 51,
        accountId: 1,
        qty: 10n,
        lockedQty: 5n,
        totalAmount: 40_000n,
      });

      const result = await service.settle(client, taker, [
        { makerOrderId: 11n, makerAccountId: 3, price: 5_000n, qty: 3n },
      ]);

      expect(tx.account.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: {
          cash: { decrement: 15_003n },
          lockedCash: { decrement: 15_003n },
          version: { increment: 1 },
        },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 11n },
        data: { filledQty: 3n, lockedAmount: 0n, status: OrderStatus.FILLED },
      });
      expect(result.order).toMatchObject({
        filledQty: 3n,
        status: OrderStatus.PARTIAL,
      });
    });

    it.each([
      ['취소된 주문', { status: OrderStatus.CANCELED }],
      ['남은 수량이 부족한 주문', { filledQty: 2n }],
      ['다른 종목의 주문', { stockId: 2 }],
      ['같은 방향의 주문', { side: OrderSide.BUY }],
    ])('호가창과 DB가 다르면(%s) 정산하지 않는다', async (_, overrides) => {
      const taker = orderOf({
        id: 20n,
        accountId: 1,
        side: OrderSide.BUY,
        price: 5_000n,
        qty: 3n,
      });
      tx.order.findMany.mockResolvedValue([
        orderOf({
          id: 11n,
          accountId: 2,
          side: OrderSide.SELL,
          price: 5_000n,
          qty: 3n,
          ...overrides,
        }),
      ]);

      await expect(
        service.settle(client, taker, [
          { makerOrderId: 11n, makerAccountId: 2, price: 5_000n, qty: 3n },
        ]),
      ).rejects.toThrow('호가창과 DB의 주문이 다릅니다');
      expect(tx.trade.create).not.toHaveBeenCalled();
    });
  });
});
