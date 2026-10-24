import { Injectable } from '@nestjs/common';
import {
  CashLedgerType,
  Order,
  OrderSide,
  OrderStatus,
  Prisma,
  Trade,
} from '../../generated/prisma/client.js';
import { FEE_RATE_BPS } from '../orders/orders.constants.js';
import {
  calculateBuyLockAmount,
  calculateFee,
} from '../orders/orders.policy.js';
import { Fill } from './matcher.js';

/** 체결 1건 금액 계산에 필요한 값 (모두 이 체결 직전 값) */
export interface FillAmountsInput {
  /** 체결가 */
  price: bigint;
  /** 체결 수량 */
  qty: bigint;
  buyOrder: Pick<Order, 'price' | 'qty' | 'filledQty' | 'lockedAmount'>;
  sellHolding: { qty: bigint; totalAmount: bigint };
}

export interface FillAmounts {
  /** 체결 금액 (체결가 × 수량) */
  notional: bigint;
  buyFee: bigint;
  sellFee: bigint;
  /** 매수자가 내는 포인트 (체결 금액 + 매수 수수료) */
  buyerCost: bigint;
  /** 매도자가 받는 포인트 (체결 금액 - 매도 수수료) */
  sellerProceeds: bigint;
  /** 매수 주문에서 풀 예약 포인트. 실제 비용과의 차액은 사용 가능 포인트로 돌아간다. */
  buyRelease: bigint;
  /** 매도한 수량의 매입원가 */
  costBasis: bigint;
  /** 실현손익 (매도자가 받는 포인트 - 매입원가) */
  realizedPnl: bigint;
}

/**
 * 체결 1건의 금액을 계산한다. 원 단위 미만은 모두 버린다.
 */
export function calculateFillAmounts(
  { price, qty, buyOrder, sellHolding }: FillAmountsInput,
  feeRateBps: bigint = FEE_RATE_BPS,
): FillAmounts {
  const notional = price * qty;
  const buyFee = calculateFee(notional, feeRateBps);
  const sellFee = calculateFee(notional, feeRateBps);
  const buyerCost = notional + buyFee;
  const sellerProceeds = notional - sellFee;

  // 마지막 체결이면 일부 체결 때 버린 수수료 단수까지 포함해 남은 예약을 모두 푼다.
  const isLastFill = buyOrder.filledQty + qty === buyOrder.qty;
  const buyRelease = isLastFill
    ? buyOrder.lockedAmount
    : calculateBuyLockAmount(buyOrder.price, qty, feeRateBps);

  const costBasis = (sellHolding.totalAmount * qty) / sellHolding.qty;

  return {
    notional,
    buyFee,
    sellFee,
    buyerCost,
    sellerProceeds,
    buyRelease,
    costBasis,
    realizedPnl: sellerProceeds - costBasis,
  };
}

/** 커밋 후 알릴 체결 */
export interface ExecutedTrade {
  trade: Trade;
  buyAccountId: number;
  sellAccountId: number;
}

export interface SettlementResult {
  /** 정산을 반영한 새 주문(taker) */
  order: Order;
  trades: ExecutedTrade[];
}

const statusOf = (qty: bigint, filledQty: bigint): OrderStatus => {
  if (filledQty === qty) {
    return OrderStatus.FILLED;
  }
  return filledQty > 0n ? OrderStatus.PARTIAL : OrderStatus.ACCEPTED;
};

/**
 * 체결을 DB에 반영한다. 모든 메서드는 주문 접수와 같은 트랜잭션 안에서, 종목별 순서 안에서 호출한다.
 */
@Injectable()
export class SettlementService {
  /**
   * 이 체결에 관련된 계좌를 account_id 오름차순으로 잠근다.
   * 다른 종목의 체결과 같은 계좌를 갱신해도, 잠그는 순서가 같아 교착 상태가 생기지 않는다.
   * 주문 접수의 예약보다 먼저 호출해야 한다.
   */
  async lockAccounts(
    tx: Prisma.TransactionClient,
    accountIds: number[],
  ): Promise<void> {
    const ids = [...new Set(accountIds)].sort((a, b) => a - b);
    await tx.$queryRaw`
      SELECT account_id
      FROM accounts
      WHERE account_id IN (${Prisma.join(ids)})
      ORDER BY account_id
      FOR UPDATE
    `;
  }

  /**
   * 새 주문(taker)과 호가창 주문(maker)들의 체결을 반영한다.
   * 체결 기록, 양쪽 주문·계좌·보유, 포인트 내역(수수료, 실현손익)을 갱신한다.
   */
  async settle(
    tx: Prisma.TransactionClient,
    taker: Order,
    fills: Fill[],
  ): Promise<SettlementResult> {
    if (fills.length === 0) {
      return { order: taker, trades: [] };
    }

    const makers = await this.lockMakerOrders(tx, taker, fills);
    // 체결마다 바뀌는 새 주문의 값. 마지막에 한 번 저장한다.
    const current = { ...taker };
    const trades: ExecutedTrade[] = [];

    for (const fill of fills) {
      const maker = makers.get(fill.makerOrderId)!;
      const [buyOrder, sellOrder] =
        taker.side === OrderSide.BUY ? [current, maker] : [maker, current];

      const sellHolding = await tx.holding.findUniqueOrThrow({
        where: {
          accountId_stockId: {
            accountId: sellOrder.accountId,
            stockId: taker.stockId,
          },
        },
      });
      const amounts = calculateFillAmounts({
        price: fill.price,
        qty: fill.qty,
        buyOrder,
        sellHolding,
      });

      const trade = await tx.trade.create({
        data: {
          stockId: taker.stockId,
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          price: fill.price,
          qty: fill.qty,
        },
      });
      await this.settleBuyer(
        tx,
        buyOrder.accountId,
        taker.stockId,
        trade,
        amounts,
      );
      await this.settleSeller(tx, sellHolding, trade, amounts);

      // 양쪽 주문의 체결 수량과 매수 예약을 줄인다.
      buyOrder.filledQty += fill.qty;
      buyOrder.lockedAmount -= amounts.buyRelease;
      sellOrder.filledQty += fill.qty;
      await tx.order.update({
        where: { id: maker.id },
        data: {
          filledQty: maker.filledQty,
          lockedAmount: maker.lockedAmount,
          status: statusOf(maker.qty, maker.filledQty),
        },
      });

      trades.push({
        trade,
        buyAccountId: buyOrder.accountId,
        sellAccountId: sellOrder.accountId,
      });
    }

    const order = await tx.order.update({
      where: { id: taker.id },
      data: {
        filledQty: current.filledQty,
        lockedAmount: current.lockedAmount,
        status: statusOf(current.qty, current.filledQty),
      },
    });
    return { order, trades };
  }

  /**
   * 체결할 호가창 주문을 잠그고, 메모리 호가창과 DB가 어긋나지 않았는지 확인한다.
   */
  private async lockMakerOrders(
    tx: Prisma.TransactionClient,
    taker: Order,
    fills: Fill[],
  ): Promise<Map<bigint, Order>> {
    const ids = fills.map(({ makerOrderId }) => makerOrderId);
    await tx.$queryRaw`
      SELECT order_id
      FROM orders
      WHERE order_id IN (${Prisma.join(ids)})
      ORDER BY order_id
      FOR UPDATE
    `;
    const orders = await tx.order.findMany({ where: { id: { in: ids } } });
    const makers = new Map(orders.map((order) => [order.id, order]));

    for (const fill of fills) {
      const maker = makers.get(fill.makerOrderId);
      const isOpen =
        maker?.status === OrderStatus.ACCEPTED ||
        maker?.status === OrderStatus.PARTIAL;
      if (
        !maker ||
        !isOpen ||
        maker.stockId !== taker.stockId ||
        maker.side === taker.side ||
        maker.qty - maker.filledQty < fill.qty
      ) {
        // 정상이라면 일어나지 않는다. 트랜잭션을 되돌리고 호가창을 DB 기준으로 다시 맞춰야 한다.
        throw new Error(
          `호가창과 DB의 주문이 다릅니다: order=${fill.makerOrderId}`,
        );
      }
    }
    return makers;
  }

  private async settleBuyer(
    tx: Prisma.TransactionClient,
    accountId: number,
    stockId: number,
    trade: Trade,
    amounts: FillAmounts,
  ): Promise<void> {
    const account = await tx.account.update({
      where: { id: accountId },
      data: {
        cash: { decrement: amounts.buyerCost },
        lockedCash: { decrement: amounts.buyRelease },
        version: { increment: 1 },
      },
    });
    await tx.holding.upsert({
      where: { accountId_stockId: { accountId, stockId } },
      create: {
        accountId,
        stockId,
        qty: trade.qty,
        totalAmount: amounts.buyerCost,
      },
      update: {
        qty: { increment: trade.qty },
        totalAmount: { increment: amounts.buyerCost },
      },
    });
    await tx.cashLedger.create({
      data: {
        accountId,
        tradeId: trade.id,
        type: CashLedgerType.BUY,
        amount: -amounts.buyerCost,
        fee: amounts.buyFee,
        balanceAfter: account.cash,
      },
    });
  }

  private async settleSeller(
    tx: Prisma.TransactionClient,
    holding: { id: number; accountId: number; qty: bigint },
    trade: Trade,
    amounts: FillAmounts,
  ): Promise<void> {
    const account = await tx.account.update({
      where: { id: holding.accountId },
      data: {
        cash: { increment: amounts.sellerProceeds },
        version: { increment: 1 },
      },
    });
    // 보유 수량이 0이 되면 행을 지운다. 묶인 수량도 함께 0이 된다.
    if (holding.qty === trade.qty) {
      await tx.holding.delete({ where: { id: holding.id } });
    } else {
      await tx.holding.update({
        where: { id: holding.id },
        data: {
          qty: { decrement: trade.qty },
          lockedQty: { decrement: trade.qty },
          totalAmount: { decrement: amounts.costBasis },
        },
      });
    }
    await tx.cashLedger.create({
      data: {
        accountId: holding.accountId,
        tradeId: trade.id,
        type: CashLedgerType.SELL,
        amount: amounts.sellerProceeds,
        fee: amounts.sellFee,
        realizedPnl: amounts.realizedPnl,
        balanceAfter: account.cash,
      },
    });
  }
}
