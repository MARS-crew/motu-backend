import { OrderSide } from '../../generated/prisma/client.js';
import { OrderBook, PriceLevel } from './order-book.js';

/** 새로 들어온 주문 */
export interface IncomingOrder {
  accountId: number;
  side: OrderSide;
  /** 지정가 */
  price: bigint;
  qty: bigint;
}

/** 호가창에 있던 주문(maker) 하나와의 체결 */
export interface Fill {
  makerOrderId: bigint;
  makerAccountId: number;
  /** 체결가 = 호가창에 있던 주문의 가격 */
  price: bigint;
  qty: bigint;
}

export type MatchResult =
  | {
      selfTrade: false;
      /** 체결 순서대로 */
      fills: Fill[];
      /** 체결하고 남은 수량. 0보다 크면 호가창에 올린다. */
      remainingQty: bigint;
    }
  /** 닿을 수 있는 가격대에 내 반대편 주문이 있어 주문을 받지 않는다. */
  | { selfTrade: true };

const opposite = (side: OrderSide): OrderSide =>
  side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;

/** 지정가로 이 가격의 반대편 호가와 체결할 수 있는지 */
const crosses = (incoming: IncomingOrder, makerPrice: bigint): boolean =>
  incoming.side === OrderSide.BUY
    ? makerPrice <= incoming.price
    : makerPrice >= incoming.price;

/**
 * 새 주문이 호가창과 어떻게 체결되는지 계산한다. 호가창은 바꾸지 않는다.
 * 가격이 좋은 호가부터, 같은 가격이면 먼저 들어온 주문부터 체결하고, 체결가는 호가창에 있던 주문의 가격이다.
 */
export function matchOrder(
  book: OrderBook,
  incoming: IncomingOrder,
): MatchResult {
  const crossingLevels: PriceLevel[] = [];
  for (const level of book.levels(opposite(incoming.side))) {
    if (!crosses(incoming, level.price)) {
      break;
    }
    crossingLevels.push(level);
  }

  // 수량과 관계없이 닿을 수 있는 가격대에 내 주문이 있으면 거부한다. 결과를 예측하기 쉽게 하기 위해서다.
  const hasOwnOrder = crossingLevels.some(({ orders }) =>
    orders.some(({ accountId }) => accountId === incoming.accountId),
  );
  if (hasOwnOrder) {
    return { selfTrade: true };
  }

  const fills: Fill[] = [];
  let remainingQty = incoming.qty;
  for (const { orders } of crossingLevels) {
    for (const maker of orders) {
      if (remainingQty === 0n) {
        return { selfTrade: false, fills, remainingQty };
      }
      const qty =
        maker.remainingQty < remainingQty ? maker.remainingQty : remainingQty;
      fills.push({
        makerOrderId: maker.orderId,
        makerAccountId: maker.accountId,
        price: maker.price,
        qty,
      });
      remainingQty -= qty;
    }
  }
  return { selfTrade: false, fills, remainingQty };
}
