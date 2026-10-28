import { OrderSide } from '../../generated/prisma/client.js';
import { matchOrder } from './matcher.js';
import { OrderBook } from './order-book.js';

const ME = 1;
const OTHER = 2;
const ANOTHER = 3;

/** [주문 ID, 가격, 수량, 계좌] 목록으로 호가창을 만든다. */
const bookOf = (
  side: OrderSide,
  orders: [bigint, bigint, bigint, number?][],
): OrderBook => {
  const book = new OrderBook();
  for (const [orderId, price, remainingQty, accountId = OTHER] of orders) {
    book.add({ orderId, accountId, side, price, remainingQty });
  }
  return book;
};

const buyOf = (price: bigint, qty: bigint) => ({
  accountId: ME,
  side: OrderSide.BUY,
  price,
  qty,
});
const sellOf = (price: bigint, qty: bigint) => ({
  accountId: ME,
  side: OrderSide.SELL,
  price,
  qty,
});

describe('matchOrder', () => {
  it('반대편 호가가 없으면 체결 없이 전부 남는다', () => {
    const result = matchOrder(new OrderBook(), buyOf(5_000n, 10n));

    expect(result).toEqual({ selfTrade: false, fills: [], remainingQty: 10n });
  });

  it('가격이 맞지 않으면 체결하지 않는다', () => {
    const book = bookOf(OrderSide.SELL, [[11n, 5_100n, 3n]]);

    const result = matchOrder(book, buyOf(5_000n, 10n));

    expect(result).toEqual({ selfTrade: false, fills: [], remainingQty: 10n });
  });

  it('매수는 낮은 매도 호가부터, 호가창에 있던 주문의 가격으로 체결한다', () => {
    const book = bookOf(OrderSide.SELL, [
      [11n, 5_100n, 5n],
      [12n, 5_000n, 3n, ANOTHER],
    ]);

    const result = matchOrder(book, buyOf(5_100n, 6n));

    expect(result).toEqual({
      selfTrade: false,
      fills: [
        { makerOrderId: 12n, makerAccountId: ANOTHER, price: 5_000n, qty: 3n },
        { makerOrderId: 11n, makerAccountId: OTHER, price: 5_100n, qty: 3n },
      ],
      remainingQty: 0n,
    });
  });

  it('매도는 높은 매수 호가부터 체결한다', () => {
    const book = bookOf(OrderSide.BUY, [
      [11n, 4_900n, 5n],
      [12n, 5_000n, 2n],
    ]);

    const result = matchOrder(book, sellOf(4_900n, 4n));

    expect(result).toMatchObject({
      fills: [
        { makerOrderId: 12n, price: 5_000n, qty: 2n },
        { makerOrderId: 11n, price: 4_900n, qty: 2n },
      ],
      remainingQty: 0n,
    });
  });

  it('같은 가격은 먼저 들어온 주문부터 체결한다', () => {
    const book = bookOf(OrderSide.SELL, [
      [11n, 5_000n, 2n],
      [12n, 5_000n, 2n],
      [13n, 5_000n, 2n],
    ]);

    const result = matchOrder(book, buyOf(5_000n, 3n));

    expect(result).toMatchObject({
      fills: [
        { makerOrderId: 11n, qty: 2n },
        { makerOrderId: 12n, qty: 1n },
      ],
      remainingQty: 0n,
    });
  });

  it('지정가보다 불리한 호가와는 체결하지 않고 남은 수량을 돌려준다', () => {
    const book = bookOf(OrderSide.SELL, [
      [11n, 5_000n, 2n],
      [12n, 5_100n, 2n],
      [13n, 5_200n, 9n],
    ]);

    const result = matchOrder(book, buyOf(5_100n, 10n));

    expect(result).toMatchObject({
      fills: [
        { makerOrderId: 11n, qty: 2n },
        { makerOrderId: 12n, qty: 2n },
      ],
      remainingQty: 6n,
    });
  });

  it('상대 주문의 수량이 더 많으면 상대 주문은 일부만 체결된다', () => {
    const book = bookOf(OrderSide.SELL, [[11n, 5_000n, 10n]]);

    const result = matchOrder(book, buyOf(5_000n, 4n));

    expect(result).toMatchObject({
      fills: [{ makerOrderId: 11n, qty: 4n }],
      remainingQty: 0n,
    });
  });

  it('호가창을 바꾸지 않는다', () => {
    const book = bookOf(OrderSide.SELL, [
      [11n, 5_000n, 2n],
      [12n, 5_100n, 5n],
    ]);

    matchOrder(book, buyOf(5_100n, 4n));

    expect(book.depth(OrderSide.SELL, 5)).toEqual([
      { price: 5_000n, qty: 2n },
      { price: 5_100n, qty: 5n },
    ]);
  });

  describe('자기 체결', () => {
    it('닿을 수 있는 가격대에 내 반대편 주문이 있으면 체결하지 않는다', () => {
      const book = bookOf(OrderSide.SELL, [[11n, 5_000n, 2n, ME]]);

      expect(matchOrder(book, buyOf(5_000n, 1n))).toEqual({ selfTrade: true });
    });

    it('다른 회원의 주문만으로 다 체결되는 경우에도 내 주문이 가격대 안에 있으면 체결하지 않는다', () => {
      const book = bookOf(OrderSide.SELL, [
        [11n, 5_000n, 10n],
        [12n, 5_100n, 1n, ME],
      ]);

      expect(matchOrder(book, buyOf(5_100n, 1n))).toEqual({ selfTrade: true });
    });

    it('매도도 같은 기준으로 확인한다', () => {
      const book = bookOf(OrderSide.BUY, [[11n, 4_900n, 2n, ME]]);

      expect(matchOrder(book, sellOf(4_800n, 1n))).toEqual({ selfTrade: true });
    });

    it('내 주문이 지정가보다 불리한 가격에 있으면 상관없다', () => {
      const book = bookOf(OrderSide.SELL, [
        [11n, 5_000n, 2n],
        [12n, 5_200n, 1n, ME],
      ]);

      expect(matchOrder(book, buyOf(5_100n, 2n))).toMatchObject({
        selfTrade: false,
        fills: [{ makerOrderId: 11n, qty: 2n }],
      });
    });

    it('같은 방향의 내 주문은 상관없다', () => {
      const book = bookOf(OrderSide.SELL, [[11n, 5_000n, 2n]]);
      book.add({
        orderId: 20n,
        accountId: ME,
        side: OrderSide.BUY,
        price: 4_900n,
        remainingQty: 1n,
      });

      expect(matchOrder(book, buyOf(5_000n, 2n))).toMatchObject({
        selfTrade: false,
        remainingQty: 0n,
      });
    });
  });
});
