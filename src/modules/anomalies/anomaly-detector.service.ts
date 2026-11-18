import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Subscription } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AnomalyStatus,
  AnomalyType,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  MatchingService,
  OrderAcceptedEvent,
  OrderFailedEvent,
  TradeExecutedEvent,
} from '../matching/matching.service.js';
import { KeyedSerialQueue } from '../matching/serial-queue.js';
import {
  ANOMALY_ERRORS,
  LARGE_ORDER_PERCENT,
  PRICE_DEVIATION_PERCENT,
  REPEATED_ORDER_COOLDOWN_MINUTES,
  REPEATED_ORDER_MIN_COUNT,
  REPEATED_ORDER_WINDOW_SECONDS,
} from './anomalies.constants.js';

/** 계좌 예약 포인트·보유 예약 수량과 미체결 주문으로 계산한 값 */
interface BalanceRow {
  user_id: number;
  cash: bigint;
  locked_cash: bigint;
  expected_locked_cash: bigint;
  qty: bigint | null;
  locked_qty: bigint | null;
  expected_locked_qty: bigint;
}

interface AnomalyInput {
  type: AnomalyType;
  error: { code: string; message: string };
  userId: number;
  stockId?: number | null;
  orderId?: bigint | null;
  tradeId?: bigint | null;
  evidence: Record<string, unknown>;
}

/**
 * 주문·체결을 보고 이상 거래를 남긴다. 주문·체결이 커밋된 뒤에 돌고, 실패해도 주문·체결에는 영향이 없다.
 * 상품·회원 상태는 바꾸지 않는다. 조치는 관리자가 이상 거래 상세에서 한다.
 */
@Injectable()
export class AnomalyDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnomalyDetectorService.name);
  /** 종목별 순서. 체결·주문 이벤트를 발행 순서대로 확인한다. 주문 처리 순서와는 따로 돈다. */
  private readonly queue = new KeyedSerialQueue<number>();
  /** 종목별로 마지막으로 확인한 체결가 */
  private readonly lastPrices = new Map<number, bigint>();
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  onModuleInit(): void {
    this.subscriptions = [
      this.matching.tradeExecuted$.subscribe((event) => {
        void this.queue.run(event.stockId, () => this.handleTrade(event));
      }),
      this.matching.orderAccepted$.subscribe((event) => {
        void this.queue.run(event.stockId, () =>
          this.handleOrderAccepted(event),
        );
      }),
      this.matching.orderFailed$.subscribe((event) => {
        void this.queue.run(event.stockId, () => this.handleOrderFailed(event));
      }),
    ];
  }

  onModuleDestroy(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  /** 체결 하나: 비정상 가격 체결과, 호가창에 있던 주문 계좌의 잔액 불일치를 확인한다. */
  async handleTrade(event: TradeExecutedEvent): Promise<void> {
    try {
      await this.detectAbnormalPrice(event);
      // 주문 ID가 접수 순서라 큰 쪽이 새로 들어온 주문이다. 그 계좌는 주문 접수 이벤트에서 확인한다.
      const makerAccountId =
        event.buyOrderId > event.sellOrderId
          ? event.sellAccountId
          : event.buyAccountId;
      await this.checkBalance(makerAccountId, event.stockId);
    } catch (error) {
      this.logger.error(
        `체결 이상 거래 탐지 실패: 체결 ${event.tradeId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** 주문 접수 하나: 대량 주문, 반복 주문, 주문한 계좌의 잔액 불일치를 확인한다. */
  async handleOrderAccepted(event: OrderAcceptedEvent): Promise<void> {
    try {
      await this.detectLargeOrder(event);
      await this.detectRepeatedOrder(event);
      await this.checkBalance(event.accountId, event.stockId);
    } catch (error) {
      this.logger.error(
        `주문 이상 거래 탐지 실패: 주문 ${event.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** 예상하지 못한 에러로 주문 접수에 실패한 경우. 주문은 롤백되어 주문 ID가 없다. */
  async handleOrderFailed(event: OrderFailedEvent): Promise<void> {
    try {
      const { error } = event;
      await this.create({
        type: AnomalyType.ORDER_FAILURE,
        error: ANOMALY_ERRORS.ORDER_FAILED,
        userId: event.userId,
        stockId: event.stockId,
        evidence: {
          side: event.side,
          orderPrice: Number(event.price),
          orderQty: Number(event.qty),
          errorName: error instanceof Error ? error.name : typeof error,
          errorCode:
            error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code
              : null,
          errorMessage: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 500),
          failedDate: event.failedDate.toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(
        `주문 처리 실패 기록 실패: 상품 ${event.stockId}, 회원 ${event.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** 직전 체결가(첫 체결이면 상장가)에서 기준 비율을 넘게 벗어난 체결 */
  private async detectAbnormalPrice(event: TradeExecutedEvent): Promise<void> {
    const previousPrice =
      this.lastPrices.get(event.stockId) ??
      (await this.findPreviousPrice(event));
    this.lastPrices.set(event.stockId, event.price);

    const gap =
      event.price > previousPrice
        ? event.price - previousPrice
        : previousPrice - event.price;
    if (gap * 100n <= previousPrice * PRICE_DEVIATION_PERCENT) {
      return;
    }

    // 가격을 움직인 쪽은 새로 들어온 주문(주문 ID가 큰 쪽)이다.
    const takerOrderId =
      event.buyOrderId > event.sellOrderId
        ? event.buyOrderId
        : event.sellOrderId;
    const takerOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: takerOrderId },
      select: { qty: true, account: { select: { userId: true } } },
    });
    await this.create({
      type: AnomalyType.ABNORMAL_PRICE,
      error: ANOMALY_ERRORS.PRICE_DEVIATION,
      userId: takerOrder.account.userId,
      stockId: event.stockId,
      orderId: takerOrderId,
      tradeId: event.tradeId,
      evidence: {
        orderQty: Number(takerOrder.qty),
        filledQty: Number(event.qty),
        basePrice: Number(previousPrice),
        tradePrice: Number(event.price),
        // 소수 둘째 자리까지. 예) 51.44
        deviationPercent:
          Number(((event.price - previousPrice) * 10_000n) / previousPrice) /
          100,
        // 기준 가격으로 체결했을 때와의 차이. 비싸게 체결되면 음수다.
        assetDifference: Number((previousPrice - event.price) * event.qty),
      },
    });
  }

  /** 주문 수량이 발행량의 기준 비율 이상인 주문 */
  private async detectLargeOrder(event: OrderAcceptedEvent): Promise<void> {
    const { listedShares } = await this.prisma.stock.findUniqueOrThrow({
      where: { id: event.stockId },
      select: { listedShares: true },
    });
    if (event.qty * 100n < listedShares * LARGE_ORDER_PERCENT) {
      return;
    }
    await this.create({
      type: AnomalyType.LARGE_ORDER,
      error: ANOMALY_ERRORS.LARGE_ORDER,
      userId: event.userId,
      stockId: event.stockId,
      orderId: event.orderId,
      evidence: {
        side: event.side,
        orderPrice: Number(event.price),
        orderQty: Number(event.qty),
        listedShares: Number(listedShares),
        // 발행량 대비 주문 수량(%), 소수 둘째 자리까지
        sharePercent: Number((event.qty * 10_000n) / listedShares) / 100,
        thresholdPercent: Number(LARGE_ORDER_PERCENT),
      },
    });
  }

  /** 같은 회원이 같은 상품에 짧은 시간 안에 기준 건수 이상 주문 */
  private async detectRepeatedOrder(event: OrderAcceptedEvent): Promise<void> {
    const since = new Date(
      event.createDate.getTime() - REPEATED_ORDER_WINDOW_SECONDS * 1000,
    );
    const orderCount = await this.prisma.order.count({
      where: {
        accountId: event.accountId,
        stockId: event.stockId,
        createDate: { gt: since, lte: event.createDate },
      },
    });
    if (orderCount < REPEATED_ORDER_MIN_COUNT) {
      return;
    }

    // 계속 주문하는 동안 주문마다 남기지 않도록 최근에 남긴 반복 주문이 있으면 건너뛴다.
    const recent = await this.prisma.anomaly.findFirst({
      where: {
        type: AnomalyType.REPEATED_ORDER,
        userId: event.userId,
        stockId: event.stockId,
        detectedDate: {
          gt: new Date(
            event.createDate.getTime() -
              REPEATED_ORDER_COOLDOWN_MINUTES * 60 * 1000,
          ),
        },
      },
      select: { id: true },
    });
    if (recent) {
      return;
    }
    await this.create({
      type: AnomalyType.REPEATED_ORDER,
      error: ANOMALY_ERRORS.REPEATED_ORDER,
      userId: event.userId,
      stockId: event.stockId,
      orderId: event.orderId,
      evidence: {
        orderCount,
        windowSeconds: REPEATED_ORDER_WINDOW_SECONDS,
        minCount: REPEATED_ORDER_MIN_COUNT,
        firstOrderDate: since.toISOString(),
        lastOrderDate: event.createDate.toISOString(),
      },
    });
  }

  /**
   * 계좌의 예약 포인트·보유 예약 수량이 미체결 주문과 맞는지 확인한다.
   * - 예약 포인트 = 미체결 매수 주문의 예약 포인트 합, 예약 포인트 ≤ 보유 포인트
   * - 예약 수량 = 그 상품 미체결 매도 주문의 남은 수량 합, 예약 수량 ≤ 보유 수량
   * 한 쿼리로 읽어 같은 시점의 커밋된 값끼리 비교한다.
   */
  private async checkBalance(accountId: number, stockId: number) {
    const [row] = await this.prisma.$queryRaw<BalanceRow[]>`
      SELECT
        a.user_id,
        a.cash,
        a.locked_cash,
        COALESCE((
          SELECT SUM(o.locked_amount) FROM orders o
          WHERE o.account_id = a.account_id AND o.side = 'BUY'
            AND o.status IN ('ACCEPTED', 'PARTIAL')
        ), 0)::bigint AS expected_locked_cash,
        h.qty,
        h.locked_qty,
        COALESCE((
          SELECT SUM(o.qty - o.filled_qty) FROM orders o
          WHERE o.account_id = a.account_id AND o.stock_id = ${stockId}
            AND o.side = 'SELL' AND o.status IN ('ACCEPTED', 'PARTIAL')
        ), 0)::bigint AS expected_locked_qty
      FROM accounts a
      LEFT JOIN holdings h ON h.account_id = a.account_id AND h.stock_id = ${stockId}
      WHERE a.account_id = ${accountId}
    `;
    if (!row) {
      return;
    }

    if (
      row.locked_cash !== row.expected_locked_cash ||
      row.locked_cash > row.cash
    ) {
      await this.createBalanceMismatch(
        row.user_id,
        null,
        ANOMALY_ERRORS.LOCKED_CASH_MISMATCH,
        {
          item: 'CASH',
          cash: Number(row.cash),
          lockedCash: Number(row.locked_cash),
          expectedLockedCash: Number(row.expected_locked_cash),
          difference: Number(row.locked_cash - row.expected_locked_cash),
        },
      );
    }

    const qty = row.qty ?? 0n;
    const lockedQty = row.locked_qty ?? 0n;
    if (lockedQty !== row.expected_locked_qty || lockedQty > qty) {
      await this.createBalanceMismatch(
        row.user_id,
        stockId,
        ANOMALY_ERRORS.LOCKED_QTY_MISMATCH,
        {
          item: 'QTY',
          qty: Number(qty),
          lockedQty: Number(lockedQty),
          expectedLockedQty: Number(row.expected_locked_qty),
          difference: Number(lockedQty - row.expected_locked_qty),
        },
      );
    }
  }

  /** 같은 회원·항목의 잔액 불일치가 아직 처리 전이면 다시 남기지 않는다. */
  private async createBalanceMismatch(
    userId: number,
    stockId: number | null,
    error: { code: string; message: string },
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const open = await this.prisma.anomaly.findFirst({
      where: {
        type: AnomalyType.BALANCE_MISMATCH,
        userId,
        stockId,
        errorCode: error.code,
        status: { not: AnomalyStatus.RESOLVED },
      },
      select: { id: true },
    });
    if (open) {
      return;
    }
    await this.create({
      type: AnomalyType.BALANCE_MISMATCH,
      error,
      userId,
      stockId,
      evidence,
    });
  }

  /** 서버가 뜬 뒤 그 종목의 첫 체결이면 DB에서 직전 체결가를 찾는다. 체결이 처음이면 상장가다. */
  private async findPreviousPrice(event: TradeExecutedEvent): Promise<bigint> {
    const previous = await this.prisma.trade.findFirst({
      where: { stockId: event.stockId, id: { lt: event.tradeId } },
      orderBy: { id: 'desc' },
      select: { price: true },
    });
    if (previous) {
      return previous.price;
    }
    const { basePrice } = await this.prisma.stock.findUniqueOrThrow({
      where: { id: event.stockId },
      select: { basePrice: true },
    });
    return basePrice;
  }

  private async create(input: AnomalyInput): Promise<void> {
    try {
      await this.prisma.anomaly.create({
        data: {
          type: input.type,
          userId: input.userId,
          stockId: input.stockId ?? null,
          orderId: input.orderId ?? null,
          tradeId: input.tradeId ?? null,
          errorCode: input.error.code,
          errorMessage: input.error.message,
          evidence: input.evidence as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // 같은 체결을 이미 남긴 경우
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }
}
