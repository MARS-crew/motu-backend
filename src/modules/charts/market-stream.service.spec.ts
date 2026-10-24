import { MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ChartInterval, OrderSide } from '../../generated/prisma/client.js';
import {
  MatchingService,
  TradeExecutedEvent,
} from '../matching/matching.service.js';
import { ChartsService } from './charts.service.js';
import { MarketStreamService } from './market-stream.service.js';

describe('MarketStreamService', () => {
  let tradeExecuted: Subject<TradeExecutedEvent>;
  let bookChanged: Subject<number>;
  const depth = vi.fn();
  const charts = {
    getDailySummary: vi.fn(),
    getCurrentCandles: vi.fn(),
  };
  let service: MarketStreamService;

  const tradeOf = (
    tradeId: bigint,
    stockId = 1,
    overrides: Partial<TradeExecutedEvent> = {},
  ): TradeExecutedEvent => ({
    tradeId,
    stockId,
    buyOrderId: 30n,
    sellOrderId: 12n,
    buyAccountId: 2,
    sellAccountId: 1,
    price: 4_400n,
    qty: 2n,
    createDate: new Date('2026-10-24T09:31:41.000Z'),
    ...overrides,
  });

  /** 스트림을 열고 받은 메시지를 모은다. */
  const open = async (stockId = 1) => {
    const messages: MessageEvent[] = [];
    const stream = service.openStream(stockId);
    const subscription = stream.subscribe((message) => messages.push(message));
    await vi.advanceTimersByTimeAsync(0);
    return { messages, subscription };
  };
  const typesOf = (messages: MessageEvent[]) =>
    messages.map(({ type, comment }) => type ?? `: ${comment}`);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    tradeExecuted = new Subject();
    bookChanged = new Subject();
    const matching = {
      tradeExecuted$: tradeExecuted.asObservable(),
      bookChanged$: bookChanged.asObservable(),
      depth,
    };
    service = new MarketStreamService(
      matching as unknown as MatchingService,
      charts as unknown as ChartsService,
    );
    depth.mockReturnValue({
      asks: [{ price: 4_400n, qty: 3n }],
      bids: [{ price: 4_300n, qty: 1n }],
    });
    charts.getDailySummary.mockResolvedValue({
      stockId: 1,
      currentPrice: 4_400,
    });
    charts.getCurrentCandles.mockResolvedValue([
      { interval: ChartInterval.MINUTE, closePrice: 4_400 },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('연결하면 현재 호가와 당일 요약을 먼저 보낸다', async () => {
    const { messages } = await open();

    expect(messages).toEqual([
      {
        type: 'orderbook',
        data: {
          stockId: 1,
          asks: [{ price: 4_400, qty: 3 }],
          bids: [{ price: 4_300, qty: 1 }],
        },
      },
      { type: 'summary', data: { stockId: 1, currentPrice: 4_400 } },
    ]);
    expect(depth).toHaveBeenCalledWith(1, 5);
    expect(charts.getDailySummary).toHaveBeenCalledWith(1);
  });

  it('그 종목의 체결마다 체결 메시지를 보내고 다른 종목의 체결은 보내지 않는다', async () => {
    const { messages } = await open();
    messages.length = 0;

    tradeExecuted.next(tradeOf(101n));
    tradeExecuted.next(tradeOf(102n, 1, { buyOrderId: 5n, sellOrderId: 40n }));
    tradeExecuted.next(tradeOf(103n, 2));

    expect(messages.filter(({ type }) => type === 'trade')).toEqual([
      {
        type: 'trade',
        data: {
          tradeId: 101,
          price: 4_400,
          qty: 2,
          side: OrderSide.BUY,
          createDate: new Date('2026-10-24T09:31:41.000Z'),
        },
      },
      {
        type: 'trade',
        data: expect.objectContaining({ tradeId: 102, side: OrderSide.SELL }),
      },
    ]);
  });

  it('짧은 시간에 체결이 몰리면 당일 요약과 봉은 마지막 체결 기준으로 한 번만 보낸다', async () => {
    const { messages } = await open();
    messages.length = 0;
    charts.getDailySummary.mockClear();

    tradeExecuted.next(tradeOf(101n));
    tradeExecuted.next(
      tradeOf(102n, 1, { createDate: new Date('2026-10-24T09:31:42.000Z') }),
    );
    await vi.advanceTimersByTimeAsync(100);

    expect(typesOf(messages)).toEqual(['trade', 'trade', 'summary', 'candles']);
    expect(charts.getDailySummary).toHaveBeenCalledTimes(1);
    expect(charts.getCurrentCandles).toHaveBeenCalledWith(
      1,
      new Date('2026-10-24T09:31:42.000Z'),
    );
    expect(messages.at(-1)).toEqual({
      type: 'candles',
      data: {
        stockId: 1,
        items: [{ interval: ChartInterval.MINUTE, closePrice: 4_400 }],
      },
    });
  });

  it('호가창이 바뀌면 호가를 짧은 시간마다 한 번만 보낸다', async () => {
    const { messages } = await open();
    messages.length = 0;

    bookChanged.next(1);
    bookChanged.next(1);
    bookChanged.next(2);
    await vi.advanceTimersByTimeAsync(100);

    expect(typesOf(messages)).toEqual(['orderbook']);
  });

  it('연결이 끊기지 않도록 15초마다 주석을 보낸다', async () => {
    const { messages } = await open();
    messages.length = 0;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(messages).toEqual([{ comment: 'ping' }, { comment: 'ping' }]);
  });

  it('같은 종목을 여러 명이 보고 있어도 체결 후 조회는 한 번만 한다', async () => {
    const first = await open();
    const second = await open();
    first.messages.length = 0;
    second.messages.length = 0;
    charts.getDailySummary.mockClear();

    tradeExecuted.next(tradeOf(101n));
    await vi.advanceTimersByTimeAsync(100);

    expect(charts.getDailySummary).toHaveBeenCalledTimes(1);
    expect(typesOf(first.messages)).toEqual(['trade', 'summary', 'candles']);
    expect(typesOf(second.messages)).toEqual(['trade', 'summary', 'candles']);
  });

  it('조회가 실패해도 스트림은 끊기지 않는다', async () => {
    const { messages } = await open();
    messages.length = 0;
    charts.getDailySummary.mockRejectedValueOnce(new Error('DB 오류'));

    tradeExecuted.next(tradeOf(101n));
    await vi.advanceTimersByTimeAsync(100);
    tradeExecuted.next(tradeOf(102n));
    await vi.advanceTimersByTimeAsync(100);

    expect(typesOf(messages)).toEqual(['trade', 'trade', 'summary', 'candles']);
  });

  it('연결을 끊으면 더 보내지 않는다', async () => {
    const { messages, subscription } = await open();
    messages.length = 0;

    subscription.unsubscribe();
    tradeExecuted.next(tradeOf(101n));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(messages).toEqual([]);
  });
});
