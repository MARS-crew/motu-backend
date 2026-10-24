import { OrderSide } from '../../generated/prisma/client.js';
import { BookOrder, OrderBook } from './order-book.js';

const orderOf = (
  orderId: bigint,
  side: OrderSide,
  price: bigint,
  remainingQty: bigint,
  accountId = 1,
): BookOrder => ({ orderId, accountId, side, price, remainingQty });

const buy = (orderId: bigint, price: bigint, qty: bigint, accountId = 1) =>
  orderOf(orderId, OrderSide.BUY, price, qty, accountId);
const sell = (orderId: bigint, price: bigint, qty: bigint, accountId = 1) =>
  orderOf(orderId, OrderSide.SELL, price, qty, accountId);

/** 가격 순서대로 [가격, [주문 ID...]] */
const snapshot = (book: OrderBook, side: OrderSide) =>
  [...book.levels(side)].map(({ price, orders }) => [
    price,
    orders.map(({ orderId }) => orderId),
  ]);

describe('OrderBook', () => {
  describe('add / levels', () => {
    it('매도 호가는 낮은 가격부터, 같은 가격은 먼저 들어온 순서로 놓인다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_100n, 1n));
      book.add(sell(2n, 5_000n, 1n));
      book.add(sell(3n, 5_100n, 1n));
      book.add(sell(4n, 4_900n, 1n));

      expect(snapshot(book, OrderSide.SELL)).toEqual([
        [4_900n, [4n]],
        [5_000n, [2n]],
        [5_100n, [1n, 3n]],
      ]);
    });

    it('매수 호가는 높은 가격부터, 같은 가격은 먼저 들어온 순서로 놓인다', () => {
      const book = new OrderBook();
      book.add(buy(1n, 4_900n, 1n));
      book.add(buy(2n, 5_000n, 1n));
      book.add(buy(3n, 4_900n, 1n));
      book.add(buy(4n, 4_800n, 1n));

      expect(snapshot(book, OrderSide.BUY)).toEqual([
        [5_000n, [2n]],
        [4_900n, [1n, 3n]],
        [4_800n, [4n]],
      ]);
    });

    it('매수와 매도는 따로 쌓인다', () => {
      const book = new OrderBook();
      book.add(buy(1n, 4_900n, 1n));
      book.add(sell(2n, 5_000n, 1n));

      expect(snapshot(book, OrderSide.BUY)).toEqual([[4_900n, [1n]]]);
      expect(snapshot(book, OrderSide.SELL)).toEqual([[5_000n, [2n]]]);
    });

    it('이미 있는 주문 ID는 다시 넣을 수 없다', () => {
      const book = new OrderBook();
      book.add(buy(1n, 4_900n, 1n));

      expect(() => book.add(buy(1n, 5_000n, 1n))).toThrow();
    });

    it('남은 수량이 0 이하인 주문은 넣을 수 없다', () => {
      const book = new OrderBook();

      expect(() => book.add(buy(1n, 4_900n, 0n))).toThrow();
    });

    it('넣은 주문을 밖에서 바꿔도 호가창은 바뀌지 않는다', () => {
      const book = new OrderBook();
      const order = buy(1n, 4_900n, 5n);
      book.add(order);

      order.remainingQty = 1n;

      expect(book.get(1n)?.remainingQty).toBe(5n);
    });
  });

  describe('bestPrice', () => {
    it('매수는 최고가, 매도는 최저가를 돌려준다', () => {
      const book = new OrderBook();
      book.add(buy(1n, 4_800n, 1n));
      book.add(buy(2n, 4_900n, 1n));
      book.add(sell(3n, 5_100n, 1n));
      book.add(sell(4n, 5_000n, 1n));

      expect(book.bestPrice(OrderSide.BUY)).toBe(4_900n);
      expect(book.bestPrice(OrderSide.SELL)).toBe(5_000n);
    });

    it('호가가 없으면 undefined다', () => {
      expect(new OrderBook().bestPrice(OrderSide.BUY)).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('주문을 빼고 뺀 주문을 돌려준다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_000n, 1n));
      book.add(sell(2n, 5_000n, 3n));

      const removed = book.remove(2n);

      expect(removed).toEqual(sell(2n, 5_000n, 3n));
      expect(book.get(2n)).toBeUndefined();
      expect(snapshot(book, OrderSide.SELL)).toEqual([[5_000n, [1n]]]);
    });

    it('가격대의 마지막 주문을 빼면 그 가격대가 없어진다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_000n, 1n));
      book.add(sell(2n, 5_100n, 1n));

      book.remove(1n);

      expect(snapshot(book, OrderSide.SELL)).toEqual([[5_100n, [2n]]]);
      expect(book.bestPrice(OrderSide.SELL)).toBe(5_100n);
    });

    it('없는 주문이면 undefined를 돌려준다', () => {
      expect(new OrderBook().remove(1n)).toBeUndefined();
    });
  });

  describe('reduce', () => {
    it('체결된 수량만큼 남은 수량을 줄이고 순서는 그대로 둔다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_000n, 5n));
      book.add(sell(2n, 5_000n, 1n));

      book.reduce(1n, 2n);

      expect(book.get(1n)?.remainingQty).toBe(3n);
      expect(snapshot(book, OrderSide.SELL)).toEqual([[5_000n, [1n, 2n]]]);
    });

    it('남은 수량이 0이 되면 호가창에서 뺀다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_000n, 5n));

      book.reduce(1n, 5n);

      expect(book.get(1n)).toBeUndefined();
      expect(snapshot(book, OrderSide.SELL)).toEqual([]);
    });

    it('남은 수량보다 많이 줄이거나 없는 주문이면 에러다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_000n, 5n));

      expect(() => book.reduce(1n, 6n)).toThrow();
      expect(() => book.reduce(9n, 1n)).toThrow();
    });
  });

  describe('depth', () => {
    it('가격대별 남은 수량 합계를 좋은 가격부터 정해진 개수만큼 돌려준다', () => {
      const book = new OrderBook();
      book.add(sell(1n, 5_000n, 2n));
      book.add(sell(2n, 5_000n, 3n));
      book.add(sell(3n, 5_100n, 1n));
      book.add(sell(4n, 5_200n, 4n));

      expect(book.depth(OrderSide.SELL, 2)).toEqual([
        { price: 5_000n, qty: 5n },
        { price: 5_100n, qty: 1n },
      ]);
    });

    it('호가가 개수보다 적으면 있는 만큼만 돌려준다', () => {
      const book = new OrderBook();
      book.add(buy(1n, 4_900n, 2n));

      expect(book.depth(OrderSide.BUY, 5)).toEqual([
        { price: 4_900n, qty: 2n },
      ]);
    });
  });
});
