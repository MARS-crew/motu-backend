import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ChartInterval, Prisma, Trade } from '../../generated/prisma/client.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { ChartErrors } from './charts.errors.js';
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

describe('ChartsService 당일 요약', () => {
  const chart = { findMany: vi.fn() };
  const stock = { findFirst: vi.fn() };
  const queryRaw = vi.fn();
  const prisma = {
    chart,
    stock,
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const service = new ChartsService(prisma);

  // 한국 시간 2026-10-24(토) 18:30 → 오늘 일봉 시작은 UTC 2026-10-23 15:00
  const NOW = new Date('2026-10-24T09:30:00.000Z');
  const TODAY = new Date('2026-10-23T15:00:00.000Z');

  const dayCandleOf = (stockId: number, overrides: Record<string, bigint>) => ({
    stockId,
    interval: ChartInterval.DAY,
    candleTime: TODAY,
    openPrice: 0n,
    highPrice: 0n,
    lowPrice: 0n,
    closePrice: 0n,
    volume: 0n,
    tradeAmount: 0n,
    ...overrides,
  });

  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as BusinessException;
    }
    throw new Error('예외가 발생하지 않았습니다.');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    chart.findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
  });

  describe('getDailySummaries', () => {
    it('오늘 일봉과 전일 종가로 현재가·전일 대비·등락률을 계산한다', async () => {
      chart.findMany.mockResolvedValue([
        dayCandleOf(1, {
          openPrice: 4_300n,
          highPrice: 4_400n,
          lowPrice: 4_250n,
          closePrice: 4_380n,
          volume: 120n,
          tradeAmount: 522_000n,
        }),
      ]);
      queryRaw.mockResolvedValue([{ stock_id: 1, close_price: 4_200n }]);

      const result = await service.getDailySummaries(
        [{ id: 1, basePrice: 4_000n }],
        NOW,
      );

      expect(chart.findMany).toHaveBeenCalledWith({
        where: {
          stockId: { in: [1] },
          interval: ChartInterval.DAY,
          candleTime: TODAY,
        },
      });
      const [sql, ...values] = queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(sql.join('?')).toMatch(/DISTINCT ON \(stock_id\)/);
      expect(sql.join('?')).toMatch(/candle_time < /);
      expect(values).toContainEqual(TODAY);
      expect(result.get(1)).toEqual({
        stockId: 1,
        currentPrice: 4_380,
        prevClosePrice: 4_200,
        changeAmount: 180,
        // 180 / 4,200 = 4.2857…%
        changeRate: 4.29,
        openPrice: 4_300,
        highPrice: 4_400,
        lowPrice: 4_250,
        volume: 120,
        tradeAmount: 522_000,
      });
    });

    it('체결된 적이 없으면 현재가와 전일 종가 모두 기준가이고 오늘 시세는 비어 있다', async () => {
      const result = await service.getDailySummaries(
        [{ id: 1, basePrice: 4_000n }],
        NOW,
      );

      expect(result.get(1)).toEqual({
        stockId: 1,
        currentPrice: 4_000,
        prevClosePrice: 4_000,
        changeAmount: 0,
        changeRate: 0,
        openPrice: null,
        highPrice: null,
        lowPrice: null,
        volume: 0,
        tradeAmount: 0,
      });
    });

    it('오늘 체결이 없으면 현재가는 전일 종가다', async () => {
      queryRaw.mockResolvedValue([{ stock_id: 1, close_price: 4_200n }]);

      const result = await service.getDailySummaries(
        [{ id: 1, basePrice: 4_000n }],
        NOW,
      );

      expect(result.get(1)).toMatchObject({
        currentPrice: 4_200,
        prevClosePrice: 4_200,
        changeAmount: 0,
        openPrice: null,
        volume: 0,
      });
    });

    it('전날까지 체결이 없으면 전일 종가는 기준가다', async () => {
      chart.findMany.mockResolvedValue([
        dayCandleOf(1, {
          openPrice: 4_000n,
          highPrice: 4_000n,
          lowPrice: 3_900n,
          closePrice: 3_900n,
          volume: 5n,
          tradeAmount: 19_600n,
        }),
      ]);

      const result = await service.getDailySummaries(
        [{ id: 1, basePrice: 4_000n }],
        NOW,
      );

      // -100 / 4,000 = -2.5%
      expect(result.get(1)).toMatchObject({
        currentPrice: 3_900,
        prevClosePrice: 4_000,
        changeAmount: -100,
        changeRate: -2.5,
      });
    });

    it('여러 종목을 쿼리 두 번으로 한꺼번에 계산한다', async () => {
      chart.findMany.mockResolvedValue([
        dayCandleOf(2, { closePrice: 8_300n, volume: 1n, tradeAmount: 8_300n }),
      ]);
      queryRaw.mockResolvedValue([
        { stock_id: 1, close_price: 4_200n },
        { stock_id: 2, close_price: 8_200n },
      ]);

      const result = await service.getDailySummaries(
        [
          { id: 1, basePrice: 4_000n },
          { id: 2, basePrice: 8_000n },
          { id: 3, basePrice: 1_000n },
        ],
        NOW,
      );

      expect(chart.findMany).toHaveBeenCalledTimes(1);
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect([...result.keys()]).toEqual([1, 2, 3]);
      expect(result.get(1)?.currentPrice).toBe(4_200);
      expect(result.get(2)?.currentPrice).toBe(8_300);
      expect(result.get(3)?.currentPrice).toBe(1_000);
    });

    it('종목이 없으면 조회하지 않는다', async () => {
      const result = await service.getDailySummaries([], NOW);

      expect(result.size).toBe(0);
      expect(chart.findMany).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('getDailySummary', () => {
    it('상품을 찾아 그 상품의 당일 요약을 돌려준다', async () => {
      stock.findFirst.mockResolvedValue({ id: 1, basePrice: 4_000n });

      const result = await service.getDailySummary(1, NOW);

      expect(stock.findFirst).toHaveBeenCalledWith({
        where: { id: 1, isDeleted: false },
        select: { id: true, basePrice: true },
      });
      expect(result).toMatchObject({ stockId: 1, currentPrice: 4_000 });
    });

    it('없거나 삭제된 상품이면 조회할 수 없다', async () => {
      stock.findFirst.mockResolvedValue(null);

      const error = await errorOf(service.getDailySummary(1, NOW));

      expect(error.error).toBe(StockErrors.NOT_FOUND);
      expect(chart.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('ChartsService 기간별 차트', () => {
  const chart = { findMany: vi.fn() };
  const stock = { findFirst: vi.fn() };
  const prisma = { chart, stock } as unknown as PrismaService;
  const service = new ChartsService(prisma);

  const candleOf = (time: string, close: bigint) => ({
    stockId: 1,
    interval: ChartInterval.MINUTE,
    candleTime: new Date(time),
    openPrice: close - 10n,
    highPrice: close + 20n,
    lowPrice: close - 30n,
    closePrice: close,
    volume: 3n,
    tradeAmount: close * 3n,
  });
  const cursorOf = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as BusinessException;
    }
    throw new Error('예외가 발생하지 않았습니다.');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stock.findFirst.mockResolvedValue({ id: 1 });
  });

  it('최신 봉부터 size개를 읽어 오래된 순으로 돌려준다', async () => {
    chart.findMany.mockResolvedValue([
      candleOf('2026-10-24T09:32:00.000Z', 4_400n),
      candleOf('2026-10-24T09:31:00.000Z', 4_350n),
    ]);

    const result = await service.getCandles({
      stockId: 1,
      interval: ChartInterval.MINUTE,
      size: 2,
    });

    expect(stock.findFirst).toHaveBeenCalledWith({
      where: { id: 1, isDeleted: false },
      select: { id: true },
    });
    expect(chart.findMany).toHaveBeenCalledWith({
      where: { stockId: 1, interval: ChartInterval.MINUTE },
      orderBy: { candleTime: 'desc' },
      take: 3,
    });
    expect(result).toEqual({
      stockId: 1,
      interval: ChartInterval.MINUTE,
      items: [
        {
          time: new Date('2026-10-24T09:31:00.000Z'),
          openPrice: 4_340,
          highPrice: 4_370,
          lowPrice: 4_320,
          closePrice: 4_350,
          volume: 3,
          tradeAmount: 13_050,
        },
        {
          time: new Date('2026-10-24T09:32:00.000Z'),
          openPrice: 4_390,
          highPrice: 4_420,
          lowPrice: 4_370,
          closePrice: 4_400,
          volume: 3,
          tradeAmount: 13_200,
        },
      ],
      nextCursor: null,
    });
  });

  it('이전 봉이 더 있으면 이번 페이지에서 가장 오래된 봉 시각으로 커서를 만든다', async () => {
    chart.findMany.mockResolvedValue([
      candleOf('2026-10-24T09:33:00.000Z', 4_400n),
      candleOf('2026-10-24T09:32:00.000Z', 4_380n),
      candleOf('2026-10-24T09:31:00.000Z', 4_350n),
    ]);

    const result = await service.getCandles({
      stockId: 1,
      interval: ChartInterval.MINUTE,
      size: 2,
    });

    expect(result.items.map(({ closePrice }) => closePrice)).toEqual([
      4_380, 4_400,
    ]);
    expect(result.nextCursor).toBe(
      cursorOf({ candleTime: '2026-10-24T09:32:00.000Z' }),
    );
  });

  it('커서를 넘기면 그보다 이전 봉을 읽는다', async () => {
    chart.findMany.mockResolvedValue([]);

    await service.getCandles({
      stockId: 1,
      interval: ChartInterval.DAY,
      cursor: cursorOf({ candleTime: '2026-10-24T09:32:00.000Z' }),
      size: 100,
    });

    expect(chart.findMany).toHaveBeenCalledWith({
      where: {
        stockId: 1,
        interval: ChartInterval.DAY,
        candleTime: { lt: new Date('2026-10-24T09:32:00.000Z') },
      },
      orderBy: { candleTime: 'desc' },
      take: 101,
    });
  });

  it('봉이 없으면 빈 목록이다', async () => {
    chart.findMany.mockResolvedValue([]);

    const result = await service.getCandles({
      stockId: 1,
      interval: ChartInterval.WEEK,
      size: 100,
    });

    expect(result).toEqual({
      stockId: 1,
      interval: ChartInterval.WEEK,
      items: [],
      nextCursor: null,
    });
  });

  it.each([
    'not-base64-json',
    cursorOf({ candleTime: 'x' }),
    cursorOf({}),
    cursorOf([]),
  ])('잘못된 커서(%s)면 처음부터 다시 불러오게 한다', async (cursor) => {
    const error = await errorOf(
      service.getCandles({
        stockId: 1,
        interval: ChartInterval.MINUTE,
        cursor,
        size: 100,
      }),
    );

    expect(error.error).toBe(ChartErrors.INVALID_CURSOR);
    expect(chart.findMany).not.toHaveBeenCalled();
  });

  it('없거나 삭제된 상품이면 조회할 수 없다', async () => {
    stock.findFirst.mockResolvedValue(null);

    const error = await errorOf(
      service.getCandles({
        stockId: 1,
        interval: ChartInterval.MINUTE,
        size: 100,
      }),
    );

    expect(error.error).toBe(StockErrors.NOT_FOUND);
  });
});

function chunk<T>(values: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    rows.push(values.slice(i, i + size));
  }
  return rows;
}
