import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Order,
  OrderSide,
  OrderStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
import { OrderResDto } from './dto/res/order-res.dto.js';
import { OrderErrors } from './orders.errors.js';
import { calculateBuyLockAmount, validateOrderRules } from './orders.policy.js';

/** 주문에 예약한 결과 */
interface LockResult {
  accountId: number;
  /** 매수 주문에 예약한 포인트. 매도는 0 */
  lockedAmount: bigint;
}

/** SELECT ... FOR UPDATE로 잠근 계좌 행 */
interface LockedAccountRow {
  account_id: number;
  cash: bigint;
  locked_cash: bigint;
}

/** SELECT ... FOR UPDATE로 잠근 보유 행 */
interface LockedHoldingRow {
  holding_id: number;
  account_id: number;
  qty: bigint;
  locked_qty: bigint;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 주문을 접수한다. 매수는 포인트를, 매도는 보유 수량을 예약한다.
   */
  async placeOrder(
    userId: number,
    dto: CreateOrderReqDto,
  ): Promise<OrderResDto> {
    const price = BigInt(dto.price);
    const qty = BigInt(dto.qty);

    // 응답을 못 받아 다시 보낸 요청이면 상품 상태와 관계없이 접수된 주문을 돌려준다.
    const existing = await this.findByClientOrderId(userId, dto.clientOrderId);
    if (existing) {
      return this.toReplayedOrderRes(existing, dto);
    }

    const stock = await this.prisma.stock.findFirst({
      where: { id: dto.stockId, isDeleted: false },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    validateOrderRules(stock, price, qty);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const { accountId, lockedAmount } =
          dto.side === OrderSide.BUY
            ? await this.lockCash(tx, userId, price, qty)
            : await this.lockQty(tx, userId, stock.id, qty);

        return tx.order.create({
          data: {
            accountId,
            stockId: stock.id,
            clientOrderId: dto.clientOrderId,
            side: dto.side,
            price,
            qty,
            lockedAmount,
          },
        });
      });
      return this.toOrderRes(order);
    } catch (error) {
      // 같은 요청이 동시에 들어와 다른 요청이 먼저 접수한 경우. 이 요청의 예약은 트랜잭션과 함께 취소된다.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const order = await this.findByClientOrderId(userId, dto.clientOrderId);
        if (order) {
          return this.toReplayedOrderRes(order, dto);
        }
      }
      throw error;
    }
  }

  /**
   * 미체결 수량을 취소하고 남은 예약(매수 포인트, 매도 수량)을 푼다. 이미 체결된 수량은 그대로다.
   * 이미 취소된 주문이면 그대로 돌려준다.
   */
  async cancelOrder(userId: number, orderId: number): Promise<OrderResDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      // 같은 주문의 취소가 동시에 들어와도 예약을 한 번만 풀도록 주문 행을 잠근다.
      const [locked] = await tx.$queryRaw<{ order_id: bigint }[]>`
        SELECT o.order_id
        FROM orders o
        JOIN accounts a ON a.account_id = o.account_id
        WHERE o.order_id = ${BigInt(orderId)} AND a.user_id = ${userId}
        FOR UPDATE OF o
      `;
      if (!locked) {
        throw new BusinessException(OrderErrors.NOT_FOUND);
      }

      const current = await tx.order.findUniqueOrThrow({
        where: { id: locked.order_id },
      });
      if (current.status === OrderStatus.CANCELED) {
        return current;
      }
      if (current.status === OrderStatus.FILLED) {
        throw new BusinessException(OrderErrors.NOT_CANCELABLE);
      }

      if (current.side === OrderSide.BUY) {
        // 포인트 지급·리셋의 버전 검사에 걸리도록 version도 올린다.
        await tx.account.update({
          where: { id: current.accountId },
          data: {
            lockedCash: { decrement: current.lockedAmount },
            version: { increment: 1 },
          },
        });
      } else {
        await tx.holding.update({
          where: {
            accountId_stockId: {
              accountId: current.accountId,
              stockId: current.stockId,
            },
          },
          data: { lockedQty: { decrement: current.qty - current.filledQty } },
        });
      }

      return tx.order.update({
        where: { id: current.id },
        data: {
          status: OrderStatus.CANCELED,
          lockedAmount: 0n,
          canceledDate: new Date(),
        },
      });
    });

    return this.toOrderRes(order);
  }

  private findByClientOrderId(
    userId: number,
    clientOrderId: string,
  ): Promise<Order | null> {
    return this.prisma.order.findFirst({
      where: { clientOrderId, account: { userId } },
    });
  }

  /**
   * 다시 보낸 요청이면 접수된 주문을 그대로 돌려준다. 같은 키로 내용이 다른 주문이면 거부한다.
   */
  private toReplayedOrderRes(
    order: Order,
    dto: CreateOrderReqDto,
  ): OrderResDto {
    const isSameRequest =
      order.stockId === dto.stockId &&
      order.side === dto.side &&
      order.price === BigInt(dto.price) &&
      order.qty === BigInt(dto.qty);
    if (!isSameRequest) {
      throw new BusinessException(OrderErrors.CLIENT_ID_REUSED);
    }
    return this.toOrderRes(order);
  }

  /**
   * 매수: 주문 금액과 수수료만큼 포인트를 예약한다.
   */
  private async lockCash(
    tx: Prisma.TransactionClient,
    userId: number,
    price: bigint,
    qty: bigint,
  ): Promise<LockResult> {
    const lockAmount = calculateBuyLockAmount(price, qty);

    // 같은 계좌의 주문·포인트 지급·리셋이 동시에 들어와도 사용 가능 포인트를 한 번씩만 쓰도록 행을 잠근다.
    const [account] = await tx.$queryRaw<LockedAccountRow[]>`
      SELECT account_id, cash, locked_cash
      FROM accounts
      WHERE user_id = ${userId}
      FOR UPDATE
    `;
    if (!account) {
      throw new BusinessException(AccountErrors.NOT_FOUND);
    }

    const availableCash = account.cash - account.locked_cash;
    if (availableCash < lockAmount) {
      throw new BusinessException(OrderErrors.INSUFFICIENT_CASH, undefined, {
        availableCash: Number(availableCash),
        requiredAmount: Number(lockAmount),
      });
    }

    // 포인트 지급·리셋의 버전 검사에 걸리도록 version도 올린다.
    await tx.account.update({
      where: { id: account.account_id },
      data: {
        lockedCash: { increment: lockAmount },
        version: { increment: 1 },
      },
    });

    return { accountId: account.account_id, lockedAmount: lockAmount };
  }

  /**
   * 매도: 주문 수량만큼 보유 수량을 예약한다.
   */
  private async lockQty(
    tx: Prisma.TransactionClient,
    userId: number,
    stockId: number,
    qty: bigint,
  ): Promise<LockResult> {
    // 같은 상품의 매도 주문이 동시에 들어와도 매도 가능 수량을 한 번씩만 쓰도록 행을 잠근다.
    const [holding] = await tx.$queryRaw<LockedHoldingRow[]>`
      SELECT h.holding_id, h.account_id, h.qty, h.locked_qty
      FROM holdings h
      JOIN accounts a ON a.account_id = h.account_id
      WHERE a.user_id = ${userId} AND h.stock_id = ${stockId}
      FOR UPDATE OF h
    `;

    const sellableQty = holding ? holding.qty - holding.locked_qty : 0n;
    if (!holding || sellableQty < qty) {
      throw new BusinessException(OrderErrors.INSUFFICIENT_QTY, undefined, {
        sellableQty: Number(sellableQty),
      });
    }

    await tx.holding.update({
      where: { id: holding.holding_id },
      data: { lockedQty: { increment: qty } },
    });

    return { accountId: holding.account_id, lockedAmount: 0n };
  }

  private toOrderRes(order: Order): OrderResDto {
    return {
      orderId: Number(order.id),
      clientOrderId: order.clientOrderId,
      stockId: order.stockId,
      side: order.side,
      orderType: order.orderType,
      price: Number(order.price),
      qty: Number(order.qty),
      filledQty: Number(order.filledQty),
      remainingQty: order.canceledDate
        ? 0
        : Number(order.qty - order.filledQty),
      lockedAmount: Number(order.lockedAmount),
      status: order.status,
      createDate: order.createDate,
      canceledDate: order.canceledDate,
    };
  }
}
