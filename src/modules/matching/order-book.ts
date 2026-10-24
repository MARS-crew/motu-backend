import { OrderSide } from '../../generated/prisma/client.js';

/** 호가창에 걸린 미체결 주문 */
export interface BookOrder {
  orderId: bigint;
  accountId: number;
  side: OrderSide;
  price: bigint;
  /** 미체결 수량 */
  remainingQty: bigint;
}

/** 한 가격대. 같은 가격의 주문이 먼저 들어온 순서로 놓인다. */
export interface PriceLevel {
  price: bigint;
  orders: readonly Readonly<BookOrder>[];
}

/** 가격대별 미체결 수량 합계 (호가) */
export interface DepthLevel {
  price: bigint;
  qty: bigint;
}

/** 한쪽(매수 또는 매도) 호가 */
class BookSide {
  /** 좋은 가격부터 정렬한 가격 목록. 매수는 높은 가격부터, 매도는 낮은 가격부터 */
  private readonly prices: bigint[] = [];
  private readonly levels = new Map<bigint, BookOrder[]>();

  constructor(private readonly side: OrderSide) {}

  add(order: BookOrder): void {
    const level = this.levels.get(order.price);
    if (level) {
      level.push(order);
      return;
    }
    this.levels.set(order.price, [order]);
    this.prices.splice(this.insertIndexOf(order.price), 0, order.price);
  }

  remove(order: BookOrder): void {
    const level = this.levels.get(order.price);
    if (!level) {
      return;
    }
    const index = level.indexOf(order);
    if (index !== -1) {
      level.splice(index, 1);
    }
    if (level.length === 0) {
      this.levels.delete(order.price);
      this.prices.splice(this.prices.indexOf(order.price), 1);
    }
  }

  best(): bigint | undefined {
    return this.prices[0];
  }

  *iterate(): Generator<PriceLevel> {
    for (const price of this.prices) {
      yield { price, orders: this.levels.get(price)! };
    }
  }

  /** 가격 순서를 지키도록 새 가격이 들어갈 자리를 이분 탐색으로 찾는다. */
  private insertIndexOf(price: bigint): number {
    let low = 0;
    let high = this.prices.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.isBetter(this.prices[mid], price)) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  private isBetter(a: bigint, b: bigint): boolean {
    return this.side === OrderSide.BUY ? a > b : a < b;
  }
}

/**
 * 종목 하나의 호가창 (메모리). DB에 반영된 미체결 주문과 항상 같아야 하므로,
 * 바꾸는 메서드는 DB 커밋에 성공한 뒤에만 호출한다.
 */
export class OrderBook {
  private readonly sides = {
    [OrderSide.BUY]: new BookSide(OrderSide.BUY),
    [OrderSide.SELL]: new BookSide(OrderSide.SELL),
  };
  private readonly orders = new Map<bigint, BookOrder>();

  add(order: BookOrder): void {
    if (this.orders.has(order.orderId)) {
      throw new Error(`이미 호가창에 있는 주문입니다: ${order.orderId}`);
    }
    if (order.remainingQty <= 0n) {
      throw new Error(`남은 수량이 없는 주문입니다: ${order.orderId}`);
    }
    const entry = { ...order };
    this.orders.set(entry.orderId, entry);
    this.sides[entry.side].add(entry);
  }

  get(orderId: bigint): Readonly<BookOrder> | undefined {
    return this.orders.get(orderId);
  }

  /** 주문을 빼고 뺀 주문을 돌려준다. 없으면 undefined */
  remove(orderId: bigint): BookOrder | undefined {
    const entry = this.orders.get(orderId);
    if (!entry) {
      return undefined;
    }
    this.orders.delete(orderId);
    this.sides[entry.side].remove(entry);
    return { ...entry };
  }

  /** 체결된 수량만큼 남은 수량을 줄인다. 0이 되면 호가창에서 뺀다. */
  reduce(orderId: bigint, qty: bigint): void {
    const entry = this.orders.get(orderId);
    if (!entry) {
      throw new Error(`호가창에 없는 주문입니다: ${orderId}`);
    }
    if (qty > entry.remainingQty) {
      throw new Error(
        `남은 수량보다 많이 줄일 수 없습니다: ${orderId} (${entry.remainingQty} < ${qty})`,
      );
    }
    entry.remainingQty -= qty;
    if (entry.remainingQty === 0n) {
      this.remove(orderId);
    }
  }

  /** 가장 좋은 가격. 매수는 최고가, 매도는 최저가. 호가가 없으면 undefined */
  bestPrice(side: OrderSide): bigint | undefined {
    return this.sides[side].best();
  }

  /** 좋은 가격부터 가격대를 차례로 돌려준다. */
  levels(side: OrderSide): Iterable<PriceLevel> {
    return this.sides[side].iterate();
  }

  /** 좋은 가격부터 count개 가격대의 미체결 수량 합계 */
  depth(side: OrderSide, count: number): DepthLevel[] {
    const result: DepthLevel[] = [];
    for (const { price, orders } of this.levels(side)) {
      if (result.length >= count) {
        break;
      }
      result.push({
        price,
        qty: orders.reduce((sum, order) => sum + order.remainingQty, 0n),
      });
    }
    return result;
  }
}
