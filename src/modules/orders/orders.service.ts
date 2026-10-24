import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Order,
  OrderSide,
  OrderStatus,
  Prisma,
  Trade,
} from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { MatchingService } from '../matching/matching.service.js';
import { SettlementService } from '../matching/settlement.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
import { GetOrderAvailableResDto } from './dto/res/get-order-available-res.dto.js';
import { GetOrderBookResDto } from './dto/res/get-order-book-res.dto.js';
import { GetOrderResDto } from './dto/res/get-order-res.dto.js';
import {
  GetOrdersResDto,
  OrderItemResDto,
} from './dto/res/get-orders-res.dto.js';
import { OrderResDto } from './dto/res/order-res.dto.js';
import {
  BPS_DENOMINATOR,
  FEE_RATE_BPS,
  ORDER_BOOK_DEPTH,
  OrderListStatus,
} from './orders.constants.js';
import { OrderErrors } from './orders.errors.js';
import { calculateBuyLockAmount, validateOrderRules } from './orders.policy.js';

/** 목록 필터별로 포함하는 주문 상태. ALL은 거르지 않는다. */
const LIST_STATUSES: Record<OrderListStatus, OrderStatus[] | undefined> = {
  [OrderListStatus.OPEN]: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL],
  [OrderListStatus.DONE]: [OrderStatus.FILLED, OrderStatus.CANCELED],
  [OrderListStatus.ALL]: undefined,
};

type OrderWithStockName = Order & { stock: { name: string } };

/** 평균 체결가 계산에 쓰는 체결 값 */
type TradeFill = Pick<Trade, 'buyOrderId' | 'sellOrderId' | 'price' | 'qty'>;

interface OrderCursor {
  orderId: number;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly settlement: SettlementService,
  ) {}

  /**
   * 주문을 접수하고 호가창과 체결한다. 매수는 포인트를, 매도는 보유 수량을 예약한다.
   * 예약·주문 생성·체결 정산을 한 트랜잭션으로 처리하고, 커밋한 뒤에 호가창에 반영한다.
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

    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    if (!account) {
      throw new BusinessException(AccountErrors.NOT_FOUND);
    }

    try {
      const order = await this.matching.runExclusive(stock.id, async () => {
        // 호가창은 이 종목의 순서 안에서만 바뀌므로, 계산한 체결 목록이 정산할 때까지 그대로다.
        const match = this.matching.match(stock.id, {
          accountId: account.id,
          side: dto.side,
          price,
          qty,
        });
        if (match.selfTrade) {
          throw new BusinessException(OrderErrors.SELF_TRADE);
        }

        const { order: settled, trades } = await this.withBookRecovery(
          stock.id,
          () =>
            this.prisma.$transaction(async (tx) => {
              await this.settlement.lockAccounts(tx, [
                account.id,
                ...match.fills.map(({ makerAccountId }) => makerAccountId),
              ]);
              const { accountId, lockedAmount } =
                dto.side === OrderSide.BUY
                  ? await this.lockCash(tx, userId, price, qty)
                  : await this.lockQty(tx, userId, stock.id, qty);

              const created = await tx.order.create({
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
              return this.settlement.settle(tx, created, match.fills);
            }),
        );

        // 커밋에 성공한 뒤에만 메모리 호가창을 바꾸고 체결을 알린다.
        this.matching.apply(stock.id, settled, match.fills);
        this.matching.publishTrades(trades);
        return settled;
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
    const owned = await this.prisma.order.findFirst({
      where: { id: BigInt(orderId), account: { userId } },
      select: { stockId: true },
    });
    if (!owned) {
      throw new BusinessException(OrderErrors.NOT_FOUND);
    }

    // 같은 종목의 체결과 겹치지 않도록 종목별 순서 안에서 취소한다. 먼저 처리된 쪽만 반영된다.
    const order = await this.matching.runExclusive(owned.stockId, async () => {
      const { order: result, canceled } = await this.prisma.$transaction(
        async (tx) => {
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
            return { order: current, canceled: false };
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
              data: {
                lockedQty: { decrement: current.qty - current.filledQty },
              },
            });
          }

          const updated = await tx.order.update({
            where: { id: current.id },
            data: {
              status: OrderStatus.CANCELED,
              lockedAmount: 0n,
              canceledDate: new Date(),
            },
          });
          return { order: updated, canceled: true };
        },
      );

      // 커밋에 성공한 취소만 호가창에 반영한다.
      if (canceled) {
        this.matching.removeOrder(result.stockId, result.id);
      }
      return result;
    });

    return this.toOrderRes(order);
  }

  /**
   * 내 주문 목록. 최근 주문순이다.
   */
  async getOrders(
    userId: number,
    query: {
      status: OrderListStatus;
      stockId?: number;
      cursor?: string;
      size: number;
    },
  ): Promise<GetOrdersResDto> {
    const afterOrderId = query.cursor
      ? this.decodeCursor(query.cursor)
      : undefined;
    const statuses = LIST_STATUSES[query.status];

    const orders = await this.prisma.order.findMany({
      where: {
        account: { userId },
        ...(statuses && { status: { in: statuses } }),
        ...(query.stockId !== undefined && { stockId: query.stockId }),
        ...(afterOrderId !== undefined && { id: { lt: afterOrderId } }),
      },
      include: { stock: { select: { name: true } } },
      orderBy: { id: 'desc' },
      take: query.size + 1,
    });

    const hasNext = orders.length > query.size;
    const page = hasNext ? orders.slice(0, query.size) : orders;
    const last = page.at(-1);

    const filledIds = page
      .filter(({ filledQty }) => filledQty > 0n)
      .map(({ id }) => id);
    const fills =
      filledIds.length > 0
        ? await this.prisma.trade.findMany({
            where: {
              OR: [
                { buyOrderId: { in: filledIds } },
                { sellOrderId: { in: filledIds } },
              ],
            },
            select: {
              buyOrderId: true,
              sellOrderId: true,
              price: true,
              qty: true,
            },
          })
        : [];

    return {
      items: page.map((order) => this.toOrderItemRes(order, fills)),
      nextCursor:
        hasNext && last
          ? this.encodeCursor({ orderId: Number(last.id) })
          : null,
    };
  }

  /**
   * 주문 상세와 그 주문의 체결 내역.
   */
  async getOrder(userId: number, orderId: number): Promise<GetOrderResDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: BigInt(orderId), account: { userId } },
      include: { stock: { select: { name: true } } },
    });
    if (!order) {
      throw new BusinessException(OrderErrors.NOT_FOUND);
    }

    const trades = await this.prisma.trade.findMany({
      where: { OR: [{ buyOrderId: order.id }, { sellOrderId: order.id }] },
      orderBy: { id: 'asc' },
    });

    return Object.assign(this.toOrderItemRes(order, trades), {
      trades: trades.map((trade) => ({
        tradeId: Number(trade.id),
        price: Number(trade.price),
        qty: Number(trade.qty),
        createDate: trade.createDate,
      })),
    });
  }

  /**
   * 주문 화면에 필요한 상품 규칙과 사용 가능 포인트, 매도 가능 수량.
   */
  async getAvailable(
    userId: number,
    stockId: number,
  ): Promise<GetOrderAvailableResDto> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    if (!account) {
      throw new BusinessException(AccountErrors.NOT_FOUND);
    }
    const holding = await this.prisma.holding.findUnique({
      where: { accountId_stockId: { accountId: account.id, stockId } },
    });

    return {
      stockId: stock.id,
      tradeStatus: stock.tradeStatus,
      priceTickSize: Number(stock.priceTickSize),
      minOrderPrice: Number(stock.minOrderPrice),
      minOrderQty: Number(stock.minOrderQty),
      feeRate: Number(FEE_RATE_BPS) / Number(BPS_DENOMINATOR),
      availableCash: Number(account.cash - account.lockedCash),
      sellableQty: holding ? Number(holding.qty - holding.lockedQty) : 0,
    };
  }

  /**
   * 정산 중 예상하지 못한 에러가 나면 호가창과 DB가 어긋났을 수 있으므로 그 종목의 호가창을 DB 기준으로 다시 만든다.
   * 업무 규칙 에러와 중복 요청(P2002)은 정상적인 거부라서 그대로 던진다.
   */
  private async withBookRecovery<T>(
    stockId: number,
    task: () => Promise<T>,
  ): Promise<T> {
    try {
      return await task();
    } catch (error) {
      const isExpected =
        error instanceof BusinessException ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002');
      if (!isExpected) {
        await this.matching.reloadBook(stockId);
      }
      throw error;
    }
  }

  /**
   * 호가 5단계. 메모리 호가창에서 읽는다.
   */
  async getOrderBook(stockId: number): Promise<GetOrderBookResDto> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
      select: { id: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }

    const { asks, bids } = this.matching.depth(stock.id, ORDER_BOOK_DEPTH);
    const toLevel = ({ price, qty }: { price: bigint; qty: bigint }) => ({
      price: Number(price),
      qty: Number(qty),
    });
    return {
      stockId: stock.id,
      asks: asks.map(toLevel),
      bids: bids.map(toLevel),
    };
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

  private toOrderItemRes(
    order: OrderWithStockName,
    fills: TradeFill[],
  ): OrderItemResDto {
    return Object.assign(this.toOrderRes(order), {
      stockName: order.stock.name,
      avgFilledPrice: this.averageFilledPrice(order, fills),
    });
  }

  /**
   * 이 주문의 체결 금액 합계 ÷ 체결 수량. 소수점 둘째 자리까지 반올림한다.
   */
  private averageFilledPrice(order: Order, fills: TradeFill[]): number | null {
    const own = fills.filter(
      (fill) =>
        (order.side === OrderSide.BUY ? fill.buyOrderId : fill.sellOrderId) ===
        order.id,
    );
    const filledQty = own.reduce((sum, fill) => sum + fill.qty, 0n);
    if (filledQty === 0n) {
      return null;
    }
    const filledAmount = own.reduce(
      (sum, fill) => sum + fill.price * fill.qty,
      0n,
    );
    return Math.round((Number(filledAmount) / Number(filledQty)) * 100) / 100;
  }

  private encodeCursor(cursor: OrderCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): bigint {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
      throw new BusinessException(OrderErrors.INVALID_CURSOR);
    }
    const orderId =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Partial<OrderCursor>).orderId
        : undefined;
    if (!Number.isSafeInteger(orderId)) {
      throw new BusinessException(OrderErrors.INVALID_CURSOR);
    }
    return BigInt(orderId!);
  }
}
