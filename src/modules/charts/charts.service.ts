import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChartInterval, Prisma, Trade } from '../../generated/prisma/client.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { candleStartOf } from './candle-time.js';
import { ChartErrors } from './charts.errors.js';
import { GetCandlesResDto } from './dto/res/get-candles-res.dto.js';
import { GetDailySummaryResDto } from './dto/res/get-daily-summary-res.dto.js';

/** 체결마다 갱신하는 봉 단위 */
const INTERVALS = Object.values(ChartInterval);

interface CandleCursor {
  /** 이 페이지에서 가장 오래된 봉의 시작 시각 */
  candleTime: string;
}

/** 당일 요약 계산에 필요한 상품 값 */
export interface SummaryStock {
  id: number;
  /** 기준가. 체결된 적이 없으면 현재가·전일 종가로 쓴다. */
  basePrice: bigint;
}

@Injectable()
export class ChartsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 체결을 봉(분·시간·일·주·월)에 반영한다. 체결 정산과 같은 트랜잭션에서 체결 순서대로 호출한다.
   * 봉이 없으면 체결가로 만들고, 있으면 시가는 두고 고가·저가·종가·거래량·거래대금을 갱신한다.
   */
  async recordTrades(
    tx: Prisma.TransactionClient,
    trades: Trade[],
  ): Promise<void> {
    // 같은 봉을 한 문장에서 두 번 갱신할 수 없으므로 체결마다 한 문장씩 실행한다.
    for (const trade of trades) {
      const amount = trade.price * trade.qty;
      const rows = INTERVALS.map(
        (interval) => Prisma.sql`(
          ${trade.stockId},
          ${interval}::chart_interval,
          ${candleStartOf(trade.createDate, interval)},
          ${trade.price}, ${trade.price}, ${trade.price}, ${trade.price},
          ${trade.qty}, ${amount}
        )`,
      );
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO charts (
          stock_id, candle_interval, candle_time,
          open_price, high_price, low_price, close_price,
          volume, trade_amount
        )
        VALUES ${Prisma.join(rows)}
        ON CONFLICT (stock_id, candle_interval, candle_time) DO UPDATE SET
          high_price = GREATEST(charts.high_price, EXCLUDED.high_price),
          low_price = LEAST(charts.low_price, EXCLUDED.low_price),
          close_price = EXCLUDED.close_price,
          volume = charts.volume + EXCLUDED.volume,
          trade_amount = charts.trade_amount + EXCLUDED.trade_amount
      `);
    }
  }

  /**
   * 상품의 당일 거래 요약. 하루 기준은 한국 시간 00시다.
   */
  async getDailySummary(
    stockId: number,
    now: Date = new Date(),
  ): Promise<GetDailySummaryResDto> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
      select: { id: true, basePrice: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    const summaries = await this.getDailySummaries([stock], now);
    return summaries.get(stock.id)!;
  }

  /**
   * 여러 상품의 당일 거래 요약(현재가, 전일 대비, 등락률, 오늘 시세)을 한꺼번에 계산한다.
   * 상품 목록처럼 여러 상품을 보여줄 때 쓴다. 상품 수와 관계없이 쿼리는 두 번이다.
   */
  async getDailySummaries(
    stocks: SummaryStock[],
    now: Date = new Date(),
  ): Promise<Map<number, GetDailySummaryResDto>> {
    if (stocks.length === 0) {
      return new Map();
    }
    const stockIds = stocks.map(({ id }) => id);
    const todayStart = candleStartOf(now, ChartInterval.DAY);

    const [todayCandles, prevCloses] = await Promise.all([
      this.prisma.chart.findMany({
        where: {
          stockId: { in: stockIds },
          interval: ChartInterval.DAY,
          candleTime: todayStart,
        },
      }),
      // 종목별로 오늘 이전 마지막 일봉의 종가
      this.prisma.$queryRaw<{ stock_id: number; close_price: bigint }[]>`
        SELECT DISTINCT ON (stock_id) stock_id, close_price
        FROM charts
        WHERE stock_id IN (${Prisma.join(stockIds)})
          AND candle_interval = 'DAY'
          AND candle_time < ${todayStart}
        ORDER BY stock_id, candle_time DESC
      `,
    ]);
    const todayByStock = new Map(
      todayCandles.map((candle) => [candle.stockId, candle]),
    );
    const prevCloseByStock = new Map(
      prevCloses.map((row) => [row.stock_id, row.close_price]),
    );

    return new Map(
      stocks.map((stock) => {
        const today = todayByStock.get(stock.id);
        const prevClose = prevCloseByStock.get(stock.id) ?? stock.basePrice;
        const currentPrice = today?.closePrice ?? prevClose;
        const changeAmount = currentPrice - prevClose;
        const summary: GetDailySummaryResDto = {
          stockId: stock.id,
          currentPrice: Number(currentPrice),
          prevClosePrice: Number(prevClose),
          changeAmount: Number(changeAmount),
          changeRate:
            prevClose === 0n
              ? 0
              : Math.round(
                  (Number(changeAmount) / Number(prevClose)) * 100 * 100,
                ) / 100,
          openPrice: today ? Number(today.openPrice) : null,
          highPrice: today ? Number(today.highPrice) : null,
          lowPrice: today ? Number(today.lowPrice) : null,
          volume: today ? Number(today.volume) : 0,
          tradeAmount: today ? Number(today.tradeAmount) : 0,
        };
        return [stock.id, summary];
      }),
    );
  }

  /**
   * 기간별 차트 봉. 최신 봉부터 size개를 읽어 오래된 순으로 돌려준다.
   * 더 이전 봉은 nextCursor로 이어서 읽는다. 체결이 없던 구간의 봉은 채우지 않는다.
   */
  async getCandles(query: {
    stockId: number;
    interval: ChartInterval;
    cursor?: string;
    size: number;
  }): Promise<GetCandlesResDto> {
    const before = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const stock = await this.prisma.stock.findFirst({
      where: { id: query.stockId, isDeleted: false },
      select: { id: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }

    const candles = await this.prisma.chart.findMany({
      where: {
        stockId: stock.id,
        interval: query.interval,
        ...(before && { candleTime: { lt: before } }),
      },
      orderBy: { candleTime: 'desc' },
      take: query.size + 1,
    });
    const hasMore = candles.length > query.size;
    const page = (hasMore ? candles.slice(0, query.size) : candles).reverse();
    const oldest = page[0];

    return {
      stockId: stock.id,
      interval: query.interval,
      items: page.map((candle) => ({
        time: candle.candleTime,
        openPrice: Number(candle.openPrice),
        highPrice: Number(candle.highPrice),
        lowPrice: Number(candle.lowPrice),
        closePrice: Number(candle.closePrice),
        volume: Number(candle.volume),
        tradeAmount: Number(candle.tradeAmount),
      })),
      nextCursor:
        hasMore && oldest
          ? this.encodeCursor({ candleTime: oldest.candleTime.toISOString() })
          : null,
    };
  }

  private encodeCursor(cursor: CandleCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): Date {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
      throw new BusinessException(ChartErrors.INVALID_CURSOR);
    }
    const candleTime =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Partial<CandleCursor>).candleTime
        : undefined;
    const date = new Date(candleTime ?? '');
    if (typeof candleTime !== 'string' || Number.isNaN(date.getTime())) {
      throw new BusinessException(ChartErrors.INVALID_CURSOR);
    }
    return date;
  }
}
