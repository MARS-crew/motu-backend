import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
} from '../../generated/prisma/client.js';
import { MatchingService, TradeExecutedEvent } from './matching.service.js';

describe('MatchingService', () => {
  const service = new MatchingService({} as PrismaService);

  describe('runExclusive', () => {
    it('같은 종목의 작업은 하나씩 순서대로 실행한다', async () => {
      const log: string[] = [];
      const task = (name: string, ms: number) => async () => {
        log.push(`${name} 시작`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        log.push(`${name} 끝`);
        return name;
      };

      const results = await Promise.all([
        service.runExclusive(1, task('a', 10)),
        service.runExclusive(1, task('b', 0)),
      ]);

      expect(results).toEqual(['a', 'b']);
      expect(log).toEqual(['a 시작', 'a 끝', 'b 시작', 'b 끝']);
    });

    it('다른 종목의 작업은 함께 실행한다', async () => {
      const log: string[] = [];
      const task = (name: string, ms: number) => async () => {
        log.push(`${name} 시작`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        log.push(`${name} 끝`);
      };

      await Promise.all([
        service.runExclusive(1, task('a', 10)),
        service.runExclusive(2, task('b', 0)),
      ]);

      expect(log).toEqual(['a 시작', 'b 시작', 'b 끝', 'a 끝']);
    });
  });

  describe('호가창', () => {
    const orderOf = (overrides: Partial<Order>): Order => ({
      id: 20n,
      accountId: 1,
      stockId: 7,
      clientOrderId: '3f2a9c1e-8b7d-4c5e-9f10-2a3b4c5d6e7f',
      side: OrderSide.BUY,
      orderType: OrderType.LIMIT,
      price: 5_000n,
      qty: 10n,
      filledQty: 0n,
      lockedAmount: 50_000n,
      status: OrderStatus.ACCEPTED,
      canceledDate: null,
      createDate: new Date(),
      modifiedDate: new Date(),
      ...overrides,
    });

    it('종목마다 호가창이 따로 있다', () => {
      const matching = new MatchingService({} as PrismaService);

      expect(matching.getBook(1)).toBe(matching.getBook(1));
      expect(matching.getBook(1)).not.toBe(matching.getBook(2));
    });

    it('match는 그 종목의 호가창으로 체결을 계산하고 호가창은 바꾸지 않는다', () => {
      const matching = new MatchingService({} as PrismaService);
      matching.getBook(7).add({
        orderId: 11n,
        accountId: 2,
        side: OrderSide.SELL,
        price: 4_900n,
        remainingQty: 3n,
      });

      const result = matching.match(7, {
        accountId: 1,
        side: OrderSide.BUY,
        price: 5_000n,
        qty: 10n,
      });

      expect(result).toEqual({
        selfTrade: false,
        fills: [
          { makerOrderId: 11n, makerAccountId: 2, price: 4_900n, qty: 3n },
        ],
        remainingQty: 7n,
      });
      expect(matching.getBook(7).get(11n)?.remainingQty).toBe(3n);
      expect(
        matching.match(8, {
          accountId: 1,
          side: OrderSide.BUY,
          price: 5_000n,
          qty: 1n,
        }),
      ).toMatchObject({ fills: [] });
    });

    it('apply는 체결된 호가창 주문을 줄이고 새 주문의 남은 수량을 호가창에 올린다', () => {
      const matching = new MatchingService({} as PrismaService);
      const book = matching.getBook(7);
      book.add({
        orderId: 11n,
        accountId: 2,
        side: OrderSide.SELL,
        price: 4_900n,
        remainingQty: 3n,
      });
      book.add({
        orderId: 12n,
        accountId: 3,
        side: OrderSide.SELL,
        price: 5_000n,
        remainingQty: 5n,
      });

      matching.apply(
        7,
        orderOf({
          id: 20n,
          qty: 10n,
          filledQty: 4n,
          status: OrderStatus.PARTIAL,
        }),
        [
          { makerOrderId: 11n, makerAccountId: 2, price: 4_900n, qty: 3n },
          { makerOrderId: 12n, makerAccountId: 3, price: 5_000n, qty: 1n },
        ],
      );

      expect(book.get(11n)).toBeUndefined();
      expect(book.get(12n)?.remainingQty).toBe(4n);
      expect(book.get(20n)).toEqual({
        orderId: 20n,
        accountId: 1,
        side: OrderSide.BUY,
        price: 5_000n,
        remainingQty: 6n,
      });
    });

    it('apply는 전부 체결된 새 주문은 호가창에 올리지 않는다', () => {
      const matching = new MatchingService({} as PrismaService);
      matching.getBook(7).add({
        orderId: 11n,
        accountId: 2,
        side: OrderSide.SELL,
        price: 4_900n,
        remainingQty: 3n,
      });

      matching.apply(
        7,
        orderOf({
          id: 20n,
          qty: 3n,
          filledQty: 3n,
          status: OrderStatus.FILLED,
        }),
        [{ makerOrderId: 11n, makerAccountId: 2, price: 4_900n, qty: 3n }],
      );

      expect(matching.getBook(7).get(20n)).toBeUndefined();
      expect(matching.getBook(7).depth(OrderSide.SELL, 5)).toEqual([]);
    });
  });

  describe('removeOrder', () => {
    it('그 종목의 호가창에서 주문을 뺀다', () => {
      const matching = new MatchingService({} as PrismaService);
      matching.getBook(7).add({
        orderId: 11n,
        accountId: 2,
        side: OrderSide.SELL,
        price: 4_900n,
        remainingQty: 3n,
      });

      matching.removeOrder(7, 11n);

      expect(matching.getBook(7).get(11n)).toBeUndefined();
    });

    it('호가창에 없는 주문이면 아무것도 하지 않는다', () => {
      const matching = new MatchingService({} as PrismaService);

      expect(() => matching.removeOrder(7, 11n)).not.toThrow();
    });
  });

  describe('publishTrades', () => {
    it('체결마다 체결 이벤트를 발행한다', () => {
      const matching = new MatchingService({} as PrismaService);
      const received: TradeExecutedEvent[] = [];
      matching.tradeExecuted$.subscribe((event) => received.push(event));
      const createDate = new Date('2026-10-24T01:00:00.000Z');

      matching.publishTrades([
        {
          trade: {
            id: 101n,
            stockId: 7,
            buyOrderId: 20n,
            sellOrderId: 11n,
            price: 4_900n,
            qty: 3n,
            createDate,
          },
          buyAccountId: 1,
          sellAccountId: 2,
        },
      ]);

      expect(received).toEqual([
        {
          tradeId: 101n,
          stockId: 7,
          buyOrderId: 20n,
          sellOrderId: 11n,
          buyAccountId: 1,
          sellAccountId: 2,
          price: 4_900n,
          qty: 3n,
          createDate,
        },
      ]);
    });
  });
});
