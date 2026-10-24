import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Order, OrderSide } from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
import { OrderResDto } from './dto/res/order-res.dto.js';
import { OrderErrors } from './orders.errors.js';
import { calculateBuyLockAmount, validateOrderRules } from './orders.policy.js';

/** SELECT ... FOR UPDATE로 잠근 계좌 행 */
interface LockedAccountRow {
  account_id: number;
  cash: bigint;
  locked_cash: bigint;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 주문을 접수한다. 매수는 주문 금액과 수수료만큼 포인트를 예약한다.
   */
  async placeOrder(
    userId: number,
    dto: CreateOrderReqDto,
  ): Promise<OrderResDto> {
    const price = BigInt(dto.price);
    const qty = BigInt(dto.qty);

    const stock = await this.prisma.stock.findFirst({
      where: { id: dto.stockId, isDeleted: false },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    validateOrderRules(stock, price, qty);

    const lockAmount = calculateBuyLockAmount(price, qty);

    const order = await this.prisma.$transaction(async (tx) => {
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

      return tx.order.create({
        data: {
          accountId: account.account_id,
          stockId: stock.id,
          clientOrderId: dto.clientOrderId,
          side: OrderSide.BUY,
          price,
          qty,
          lockedAmount: lockAmount,
        },
      });
    });

    return this.toOrderRes(order);
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
