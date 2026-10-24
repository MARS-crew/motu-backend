import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChartInterval, Prisma, Trade } from '../../generated/prisma/client.js';
import { ChartsService } from './charts.service.js';

describe('ChartsService', () => {
  const service = new ChartsService({} as PrismaService);

  describe('recordTrades', () => {
    const tx = { $executeRaw: vi.fn() };
    const client = tx as unknown as Prisma.TransactionClient;

    const tradeOf = (overrides: Partial<Trade>): Trade => ({
      id: 101n,
      stockId: 7,
      buyOrderId: 20n,
      sellOrderId: 11n,
      price: 4_900n,
      qty: 3n,
      // 한국 시간 2026-10-24(토) 14:37:42
      createDate: new Date('2026-10-24T05:37:42.000Z'),
      ...overrides,
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('체결 한 건으로 분·시간·일·주·월 봉 다섯 개를 한 문장으로 갱신한다', async () => {
      await service.recordTrades(client, [tradeOf({})]);

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [sql] = tx.$executeRaw.mock.calls[0] as [Prisma.Sql];
      expect(sql.sql).toMatch(/INSERT INTO charts/);
      expect(sql.sql).toMatch(
        /ON CONFLICT \(stock_id, candle_interval, candle_time\) DO UPDATE/,
      );
      // 시가는 그대로 두고 고가·저가·종가·거래량·거래대금만 바꾼다.
      expect(sql.sql).not.toMatch(/open_price\s*=/);
      expect(sql.sql).toMatch(
        /high_price = GREATEST\(charts\.high_price, EXCLUDED\.high_price\)/,
      );
      expect(sql.sql).toMatch(
        /low_price = LEAST\(charts\.low_price, EXCLUDED\.low_price\)/,
      );
      expect(sql.sql).toMatch(/close_price = EXCLUDED\.close_price/);
      expect(sql.sql).toMatch(/volume = charts\.volume \+ EXCLUDED\.volume/);
      expect(sql.sql).toMatch(
        /trade_amount = charts\.trade_amount \+ EXCLUDED\.trade_amount/,
      );
    });

    it('봉마다 그 단위의 시작 시각과 체결가·수량·거래대금을 넣는다', async () => {
      await service.recordTrades(client, [tradeOf({})]);

      const [sql] = tx.$executeRaw.mock.calls[0] as [Prisma.Sql];
      // 봉 하나당 (종목, 단위, 시작 시각, 시가, 고가, 저가, 종가, 거래량, 거래대금)
      const rows = chunk(sql.values, 9);
      expect(rows).toEqual([
        [
          7,
          ChartInterval.MINUTE,
          new Date('2026-10-24T05:37:00.000Z'),
          4_900n,
          4_900n,
          4_900n,
          4_900n,
          3n,
          14_700n,
        ],
        [
          7,
          ChartInterval.HOUR,
          new Date('2026-10-24T05:00:00.000Z'),
          4_900n,
          4_900n,
          4_900n,
          4_900n,
          3n,
          14_700n,
        ],
        [
          7,
          ChartInterval.DAY,
          new Date('2026-10-23T15:00:00.000Z'),
          4_900n,
          4_900n,
          4_900n,
          4_900n,
          3n,
          14_700n,
        ],
        [
          7,
          ChartInterval.WEEK,
          new Date('2026-10-18T15:00:00.000Z'),
          4_900n,
          4_900n,
          4_900n,
          4_900n,
          3n,
          14_700n,
        ],
        [
          7,
          ChartInterval.MONTH,
          new Date('2026-09-30T15:00:00.000Z'),
          4_900n,
          4_900n,
          4_900n,
          4_900n,
          3n,
          14_700n,
        ],
      ]);
    });

    it('체결이 여러 건이면 체결 순서대로 한 건씩 갱신한다', async () => {
      await service.recordTrades(client, [
        tradeOf({ id: 101n, price: 4_900n }),
        tradeOf({ id: 102n, price: 5_000n }),
      ]);

      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
      const closes = tx.$executeRaw.mock.calls.map(
        ([sql]) => (sql as Prisma.Sql).values[6],
      );
      expect(closes).toEqual([4_900n, 5_000n]);
    });

    it('체결이 없으면 아무것도 하지 않는다', async () => {
      await service.recordTrades(client, []);

      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });
});

function chunk<T>(values: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    rows.push(values.slice(i, i + size));
  }
  return rows;
}
