import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderSide,
  OrderStatus,
  Prisma,
  Stock,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { TRADING_TX_OPTIONS } from '../orders/orders.constants.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { MatchingErrors } from './matching.errors.js';
import { MatchingService } from './matching.service.js';
import { SettlementService } from './settlement.js';

/**
 * 거래 상태를 바꾸는 트랜잭션 안에서 호출하는 함수. 바꾸기 전 상품을 받는다.
 * - check: 상태를 바꾸기 전에 호출한다. 현재 상태로 할 수 없는 처리면 예외를 던진다.
 * - afterChange: 상태를 바꾼 뒤 호출한다. 관리자 활동 이력처럼 같이 커밋할 작업을 넣는다.
 */
export interface TradeStatusHooks {
  check?: (stock: Stock) => void;
  afterChange?: (
    tx: Prisma.TransactionClient,
    change: { stock: Stock; canceledCount: number },
  ) => Promise<unknown>;
}

/**
 * 상품의 거래 시작(상장), 거래 중지·재개, 거래 종료. 상장 승인·관리자 상품 관리에서 호출한다.
 * 거래 중지와 종료는 미체결 주문을 모두 취소하고 예약을 푼다. 재개하면 새 주문부터 다시 받는다.
 */
@Injectable()
export class StockTradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly settlement: SettlementService,
  ) {}

  /**
   * 거래 대기 상품의 거래를 시작한다. 희망 거래 시작일시에 호출한다.
   * 상장 신청자에게 발행 주식 전량을 주고(평균 매입 단가 = 상장가), 상장가에 전량 매도 주문을 건다.
   */
  async openListing(
    stockId: number,
    issuerUserId: number,
  ): Promise<{ orderId: bigint }> {
    return this.matching.runExclusive(stockId, async () => {
      const order = await this.prisma.$transaction(async (tx) => {
        const stock = await this.findStock(tx, stockId);
        if (stock.tradeStatus !== TradeStatus.PENDING) {
          throw new BusinessException(MatchingErrors.LISTING_NOT_PENDING);
        }
        const account = await tx.account.findUnique({
          where: { userId: issuerUserId },
        });
        if (!account) {
          throw new BusinessException(AccountErrors.NOT_FOUND);
        }

        // 발행 주식은 모두 상장 매도 주문에 묶인다.
        await tx.holding.create({
          data: {
            accountId: account.id,
            stockId,
            qty: stock.listedShares,
            lockedQty: stock.listedShares,
            totalAmount: stock.basePrice * stock.listedShares,
          },
        });
        const listingOrder = await tx.order.create({
          data: {
            accountId: account.id,
            stockId,
            clientOrderId: randomUUID(),
            side: OrderSide.SELL,
            price: stock.basePrice,
            qty: stock.listedShares,
          },
        });
        await tx.stock.update({
          where: { id: stockId },
          data: { tradeStatus: TradeStatus.ACTIVE },
        });
        return listingOrder;
      }, TRADING_TX_OPTIONS);

      // 거래 시작 전에는 주문을 받지 않으므로 호가창이 비어 있어 체결할 것이 없다.
      this.matching.apply(stockId, order, []);
      return { orderId: order.id };
    });
  }

  /**
   * 상품의 거래를 중지한다. 미체결 주문을 모두 취소하고 예약(매수 포인트, 매도 수량)을 푼다.
   * 지정가 알림은 재개 후에 다시 쓸 수 있도록 그대로 둔다.
   */
  pauseStock(
    stockId: number,
    hooks: TradeStatusHooks = {},
  ): Promise<{ canceledCount: number }> {
    return this.stopTrading(stockId, TradeStatus.PAUSED, hooks);
  }

  /**
   * 상품의 거래를 종료한다. 미체결 주문을 모두 취소하고 예약(매수 포인트, 매도 수량)을 푼다. 켜진 지정가 알림도 끈다.
   * 이미 종료된 상품이면 취소할 주문이 없으므로 그대로 끝난다.
   */
  closeStock(
    stockId: number,
    hooks: TradeStatusHooks = {},
  ): Promise<{ canceledCount: number }> {
    return this.stopTrading(stockId, TradeStatus.CLOSED, hooks);
  }

  /** 중지한 상품의 거래를 다시 연다. 중지할 때 주문을 모두 취소했으므로 호가창은 비어 있다. */
  async resumeStock(
    stockId: number,
    hooks: TradeStatusHooks = {},
  ): Promise<void> {
    await this.matching.runExclusive(stockId, () =>
      this.prisma.$transaction(async (tx) => {
        const stock = await this.findStock(tx, stockId);
        hooks.check?.(stock);
        await tx.stock.update({
          where: { id: stockId },
          data: { tradeStatus: TradeStatus.ACTIVE },
        });
        await hooks.afterChange?.(tx, { stock, canceledCount: 0 });
      }, TRADING_TX_OPTIONS),
    );
  }

  /** 거래를 중지하거나 종료한다. 미체결 주문을 취소하고, 커밋한 뒤 호가창을 비운다. */
  private async stopTrading(
    stockId: number,
    status: typeof TradeStatus.PAUSED | typeof TradeStatus.CLOSED,
    hooks: TradeStatusHooks,
  ): Promise<{ canceledCount: number }> {
    return this.matching.runExclusive(stockId, async () => {
      const canceledCount = await this.prisma.$transaction(async (tx) => {
        const stock = await this.findStock(tx, stockId);
        hooks.check?.(stock);

        const canceled = await this.cancelOpenOrders(tx, stockId);
        await tx.stock.update({
          where: { id: stockId },
          data: { tradeStatus: status },
        });
        if (status === TradeStatus.CLOSED) {
          // 더는 체결되지 않으므로 켜진 지정가 알림도 끈다.
          await tx.priceAlert.updateMany({
            where: { stockId, isActive: true },
            data: { isActive: false },
          });
        }
        await hooks.afterChange?.(tx, { stock, canceledCount: canceled });
        return canceled;
      }, TRADING_TX_OPTIONS);

      this.matching.clearBook(stockId);
      return { canceledCount };
    });
  }

  private async findStock(
    tx: Prisma.TransactionClient,
    stockId: number,
  ): Promise<Stock> {
    // 예약 시작·중지·종료가 다른 서버에서 겹쳐도 상태와 발행·주문 취소를 직렬화한다.
    await tx.$queryRaw`SELECT stock_id FROM stocks WHERE stock_id = ${stockId} FOR UPDATE`;
    const stock = await tx.stock.findFirst({
      where: { id: stockId, isDeleted: false },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    return stock;
  }

  /** 미체결 주문을 모두 취소하고 예약(매수 포인트, 매도 수량)을 푼다. 취소한 주문 수를 돌려준다. */
  private async cancelOpenOrders(
    tx: Prisma.TransactionClient,
    stockId: number,
  ): Promise<number> {
    const openOrders = await tx.order.findMany({
      where: {
        stockId,
        status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
      },
    });
    if (openOrders.length === 0) {
      return 0;
    }

    const buys = openOrders.filter(({ side }) => side === OrderSide.BUY);
    const sells = openOrders.filter(({ side }) => side === OrderSide.SELL);

    // 체결 정산과 같은 순서(account_id 오름차순)로 계좌를 잠근다.
    if (buys.length > 0) {
      await this.settlement.lockAccounts(
        tx,
        buys.map(({ accountId }) => accountId),
      );
    }
    for (const [accountId, lockedAmount] of sumBy(
      buys,
      ({ lockedAmount }) => lockedAmount,
    )) {
      // 포인트 지급·리셋의 버전 검사에 걸리도록 version도 올린다.
      await tx.account.update({
        where: { id: accountId },
        data: {
          lockedCash: { decrement: lockedAmount },
          version: { increment: 1 },
        },
      });
    }
    for (const [accountId, remainingQty] of sumBy(
      sells,
      ({ qty, filledQty }) => qty - filledQty,
    )) {
      await tx.holding.update({
        where: { accountId_stockId: { accountId, stockId } },
        data: { lockedQty: { decrement: remainingQty } },
      });
    }

    await tx.order.updateMany({
      where: { id: { in: openOrders.map(({ id }) => id) } },
      data: {
        status: OrderStatus.CANCELED,
        lockedAmount: 0n,
        canceledDate: new Date(),
      },
    });
    return openOrders.length;
  }
}

/** 계좌별 합계. 처음 나온 계좌 순서를 지킨다. */
function sumBy<T extends { accountId: number }>(
  items: T[],
  valueOf: (item: T) => bigint,
): Map<number, bigint> {
  const sums = new Map<number, bigint>();
  for (const item of items) {
    sums.set(item.accountId, (sums.get(item.accountId) ?? 0n) + valueOf(item));
  }
  return sums;
}
