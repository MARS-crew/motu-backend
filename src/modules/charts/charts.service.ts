import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChartInterval, Prisma, Trade } from '../../generated/prisma/client.js';
import { candleStartOf } from './candle-time.js';

/** 체결마다 갱신하는 봉 단위 */
const INTERVALS = Object.values(ChartInterval);

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
}
