import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderSide,
  OrderStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { GetFilledOrdersResDto } from './dto/res/get-filled-orders-res.dto.js';
import { GetOpenOrdersResDto } from './dto/res/get-open-orders-res.dto.js';
import { GetTradeHistoriesResDto } from './dto/res/get-trade-histories-res.dto.js';
import { GetTradeHistorySummaryResDto } from './dto/res/get-trade-history-summary-res.dto.js';
import {
  OpenOrderSort,
  TradeHistorySort,
} from './trade-histories.constants.js';
import { TradeHistoryErrors } from './trade-histories.errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 한국 시간(UTC+9) */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 조회 기간. 한국 날짜 from 00시부터 to 다음 날 00시 전까지다. */
interface Period {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

interface PeriodQuery {
  from?: string;
  to?: string;
}

interface PageQuery extends PeriodQuery {
  page: number;
  size: number;
}

/** 조회 대상 계좌와 기간 */
interface Scope {
  accountId: number;
  period: Period;
  /** 마지막 포인트 리셋 시각. 이 시각 이전 거래는 보여주지 않는다. */
  resetAt: Date | null;
}

interface FillRow {
  trade_id: bigint;
  create_date: Date;
  order_id: bigint;
  stock_id: number;
  stock_name: string;
  side: OrderSide;
  price: bigint;
  qty: bigint;
  amount: bigint;
  fee: bigint;
}

interface FilledOrderRow {
  order_id: bigint;
  stock_id: number;
  stock_name: string;
  side: OrderSide;
  order_price: bigint;
  order_qty: bigint;
  status: OrderStatus;
  filled_qty: bigint;
  filled_amount: bigint;
  fee: bigint;
  filled_at: Date;
}

interface OpenOrderRow {
  order_id: bigint;
  stock_id: number;
  stock_name: string;
  side: OrderSide;
  price: bigint;
  qty: bigint;
  filled_qty: bigint;
  order_amount: bigint;
  status: OrderStatus;
  create_date: Date;
}

const FILL_ORDER_BY: Record<TradeHistorySort, Prisma.Sql> = {
  [TradeHistorySort.LATEST]: Prisma.sql`create_date DESC, trade_id DESC`,
  [TradeHistorySort.AMOUNT]: Prisma.sql`amount DESC, create_date DESC, trade_id DESC`,
  [TradeHistorySort.STOCK_NAME]: Prisma.sql`lower(stock_name), stock_name, create_date DESC, trade_id DESC`,
};

const FILLED_ORDER_ORDER_BY: Record<TradeHistorySort, Prisma.Sql> = {
  [TradeHistorySort.LATEST]: Prisma.sql`filled_at DESC, order_id DESC`,
  [TradeHistorySort.AMOUNT]: Prisma.sql`filled_amount DESC, filled_at DESC, order_id DESC`,
  [TradeHistorySort.STOCK_NAME]: Prisma.sql`lower(stock_name), stock_name, filled_at DESC, order_id DESC`,
};

const OPEN_ORDER_ORDER_BY: Record<OpenOrderSort, Prisma.Sql> = {
  [OpenOrderSort.LATEST]: Prisma.sql`o.create_date DESC, o.order_id DESC`,
  [OpenOrderSort.AMOUNT]: Prisma.sql`order_amount DESC, o.create_date DESC, o.order_id DESC`,
};

/**
 * 거래내역 화면의 거래내역·체결주문·미체결주문 탭.
 * 포인트 리셋 이전 거래는 리셋 때 삭제한 것으로 보고 보여주지 않는다.
 * (체결은 상대방 거래내역과 시세 차트에도 쓰여 실제로 지우지 않는다.)
 */
@Injectable()
export class TradeHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 조회 기간의 내 체결을 한 건씩 보여준다. */
  async getTradeHistories(
    userId: number,
    query: PageQuery & { sort: TradeHistorySort },
    now: Date = new Date(),
  ): Promise<GetTradeHistoriesResDto> {
    const scope = await this.scopeOf(userId, query, now);
    const fills = this.fillsSql(scope);
    const [rows, [{ count }]] = await Promise.all([
      this.prisma.$queryRaw<FillRow[]>`
        WITH fills AS (${fills})
        SELECT * FROM fills
        ORDER BY ${FILL_ORDER_BY[query.sort]}
        LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        WITH fills AS (${fills}) SELECT count(*) AS count FROM fills
      `,
    ]);

    return {
      ...this.pageOf(scope.period, query, count),
      items: rows.map((row) => ({
        tradeId: Number(row.trade_id),
        tradedAt: row.create_date,
        orderId: Number(row.order_id),
        stockId: row.stock_id,
        stockName: row.stock_name,
        side: row.side,
        price: Number(row.price),
        qty: Number(row.qty),
        amount: Number(row.amount),
        fee: Number(row.fee),
      })),
    };
  }

  /** 조회 기간의 총·매수·매도 거래금액. 거래금액은 체결가 × 수량이고 수수료는 넣지 않는다. */
  async getSummary(
    userId: number,
    query: PeriodQuery,
    now: Date = new Date(),
  ): Promise<GetTradeHistorySummaryResDto> {
    const scope = await this.scopeOf(userId, query, now);
    const [sums] = await this.prisma.$queryRaw<
      { buy_amount: bigint; sell_amount: bigint }[]
    >`
      WITH fills AS (${this.fillsSql(scope)})
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE side = 'BUY'), 0)::bigint AS buy_amount,
        COALESCE(SUM(amount) FILTER (WHERE side = 'SELL'), 0)::bigint AS sell_amount
      FROM fills
    `;

    return {
      from: scope.period.from,
      to: scope.period.to,
      totalAmount: Number(sums.buy_amount + sums.sell_amount),
      buyAmount: Number(sums.buy_amount),
      sellAmount: Number(sums.sell_amount),
    };
  }

  /**
   * 조회 기간에 체결이 있었던 내 주문. 부분 체결이면 실제 체결된 수량과 금액만 더한다.
   * 체결일시는 그 주문의 기간 안 마지막 체결 시각이다.
   */
  async getFilledOrders(
    userId: number,
    query: PageQuery & { sort: TradeHistorySort },
    now: Date = new Date(),
  ): Promise<GetFilledOrdersResDto> {
    const scope = await this.scopeOf(userId, query, now);
    const fills = this.fillsSql(scope);
    const [rows, [{ count }]] = await Promise.all([
      this.prisma.$queryRaw<FilledOrderRow[]>`
        WITH fills AS (${fills}),
        filled_orders AS (
          SELECT
            f.order_id, f.stock_id, f.stock_name, f.side,
            o.price AS order_price, o.qty AS order_qty, o.status::text AS status,
            SUM(f.qty)::bigint AS filled_qty,
            SUM(f.amount)::bigint AS filled_amount,
            SUM(f.fee)::bigint AS fee,
            MAX(f.create_date) AS filled_at
          FROM fills f
          JOIN orders o ON o.order_id = f.order_id
          GROUP BY f.order_id, f.stock_id, f.stock_name, f.side, o.price, o.qty, o.status
        )
        SELECT * FROM filled_orders
        ORDER BY ${FILLED_ORDER_ORDER_BY[query.sort]}
        LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        WITH fills AS (${fills})
        SELECT count(DISTINCT order_id) AS count FROM fills
      `,
    ]);

    return {
      ...this.pageOf(scope.period, query, count),
      items: rows.map((row) => ({
        orderId: Number(row.order_id),
        stockId: row.stock_id,
        stockName: row.stock_name,
        side: row.side,
        orderPrice: Number(row.order_price),
        orderQty: Number(row.order_qty),
        filledQty: Number(row.filled_qty),
        filledAmount: Number(row.filled_amount),
        fee: Number(row.fee),
        status: row.status,
        filledAt: row.filled_at,
      })),
    };
  }

  /** 조회 기간에 접수한 내 주문 중 아직 미체결 수량이 남은 주문 (접수, 일부 체결). */
  async getOpenOrders(
    userId: number,
    query: PageQuery & { sort: OpenOrderSort },
    now: Date = new Date(),
  ): Promise<GetOpenOrdersResDto> {
    const scope = await this.scopeOf(userId, query, now);
    const where = Prisma.sql`
      o.account_id = ${scope.accountId}
      AND o.status IN ('ACCEPTED', 'PARTIAL')
      AND o.create_date >= ${scope.period.start}
      AND o.create_date < ${scope.period.end}
      ${scope.resetAt ? Prisma.sql`AND o.create_date > ${scope.resetAt}` : Prisma.empty}
    `;
    const [rows, [{ count }]] = await Promise.all([
      this.prisma.$queryRaw<OpenOrderRow[]>`
        SELECT
          o.order_id, o.stock_id, s.stock_name, o.side::text AS side,
          o.price, o.qty, o.filled_qty, o.price * o.qty AS order_amount,
          o.status::text AS status, o.create_date
        FROM orders o
        JOIN stocks s ON s.stock_id = o.stock_id
        WHERE ${where}
        ORDER BY ${OPEN_ORDER_ORDER_BY[query.sort]}
        LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM orders o WHERE ${where}
      `,
    ]);

    return {
      ...this.pageOf(scope.period, query, count),
      items: rows.map((row) => ({
        orderId: Number(row.order_id),
        stockId: row.stock_id,
        stockName: row.stock_name,
        side: row.side,
        price: Number(row.price),
        qty: Number(row.qty),
        filledQty: Number(row.filled_qty),
        remainingQty: Number(row.qty - row.filled_qty),
        orderAmount: Number(row.order_amount),
        status: row.status,
        orderedAt: row.create_date,
      })),
    };
  }

  private async scopeOf(
    userId: number,
    query: PeriodQuery,
    now: Date,
  ): Promise<Scope> {
    const period = this.periodOf(query, now);
    const account = await this.prisma.account.findUnique({
      where: { userId },
      select: { id: true, lastPointResetAt: true },
    });
    if (!account) {
      throw new BusinessException(AccountErrors.NOT_FOUND);
    }
    return { accountId: account.id, period, resetAt: account.lastPointResetAt };
  }

  /** 비어 있으면 이번 달 1일 ~ 오늘(한국 날짜)이다. */
  private periodOf(query: PeriodQuery, now: Date): Period {
    const today = new Date(now.getTime() + KST_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    const from = query.from ?? `${today.slice(0, 8)}01`;
    const to = query.to ?? today;
    if (from > to) {
      throw new BusinessException(TradeHistoryErrors.INVALID_PERIOD);
    }
    return {
      from,
      to,
      start: this.kstDayStart(from),
      end: new Date(this.kstDayStart(to).getTime() + DAY_MS),
    };
  }

  /** 한국 날짜(YYYY-MM-DD)의 00시 */
  private kstDayStart(date: string): Date {
    return new Date(`${date}T00:00:00+09:00`);
  }

  /**
   * 조회 기간의 내 체결. 체결로 생긴 포인트 이력(BUY, SELL)에서 찾으므로 내 쪽 매수·매도와 수수료를 바로 알 수 있다.
   * 자전거래는 막혀 있어 한 체결에 내 이력은 하나뿐이다.
   */
  private fillsSql(scope: Scope): Prisma.Sql {
    return Prisma.sql`
      SELECT
        t.trade_id, t.create_date,
        CASE WHEN l.type = 'BUY' THEN t.buy_order_id ELSE t.sell_order_id END AS order_id,
        s.stock_id, s.stock_name, l.type::text AS side,
        t.price, t.qty, t.price * t.qty AS amount, l.fee
      FROM cash_ledgers l
      JOIN trades t ON t.trade_id = l.trade_id
      JOIN stocks s ON s.stock_id = t.stock_id
      WHERE l.account_id = ${scope.accountId}
        AND l.type IN ('BUY', 'SELL')
        AND t.create_date >= ${scope.period.start}
        AND t.create_date < ${scope.period.end}
        ${scope.resetAt ? Prisma.sql`AND t.create_date > ${scope.resetAt}` : Prisma.empty}
    `;
  }

  private pageOf(
    period: Period,
    query: PageQuery,
    count: bigint,
  ): {
    from: string;
    to: string;
    page: number;
    size: number;
    totalCount: number;
  } {
    return {
      from: period.from,
      to: period.to,
      page: query.page,
      size: query.size,
      totalCount: Number(count),
    };
  }
}
