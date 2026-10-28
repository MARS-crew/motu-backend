import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import {
  auditTime,
  catchError,
  concatMap,
  defer,
  EMPTY,
  filter,
  from,
  interval,
  map,
  merge,
  mergeMap,
  Observable,
  share,
} from 'rxjs';
import { OrderSide } from '../../generated/prisma/client.js';
import {
  MatchingService,
  TradeExecutedEvent,
} from '../matching/matching.service.js';
import { ORDER_BOOK_DEPTH } from '../orders/orders.constants.js';
import { STREAM_HEARTBEAT_MS, STREAM_THROTTLE_MS } from './charts.constants.js';
import { ChartsService } from './charts.service.js';

/**
 * 상품 상세 화면의 실시간 시세(SSE).
 * 이벤트: trade(체결마다), orderbook(호가창 변경), summary(당일 요약), candles(현재 봉).
 */
@Injectable()
export class MarketStreamService {
  private readonly logger = new Logger(MarketStreamService.name);
  /** 종목별 실시간 메시지. 같은 종목을 보는 연결끼리 나눠 쓴다. */
  private readonly liveStreams = new Map<number, Observable<MessageEvent>>();

  constructor(
    private readonly matching: MatchingService,
    private readonly charts: ChartsService,
  ) {}

  /**
   * 그 종목의 실시간 시세 스트림을 연다. 연결하면 현재 호가와 당일 요약을 먼저 보낸다.
   * 상품이 있는지는 호출하는 쪽에서 먼저 확인한다.
   */
  openStream(stockId: number): Observable<MessageEvent> {
    const snapshot$ = defer(() => {
      const orderbook = this.orderbookMessage(stockId);
      return from(this.summaryMessage(stockId)).pipe(
        map((summary) => [orderbook, summary]),
        catchError((error: unknown) => {
          this.logger.error(error);
          return [[orderbook]];
        }),
        mergeMap((messages) => messages),
      );
    });
    const heartbeat$ = interval(STREAM_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ comment: 'ping' })),
    );
    return merge(snapshot$, this.liveStream(stockId), heartbeat$);
  }

  private liveStream(stockId: number): Observable<MessageEvent> {
    const cached = this.liveStreams.get(stockId);
    if (cached) {
      return cached;
    }

    const trades$ = this.matching.tradeExecuted$.pipe(
      filter((trade) => trade.stockId === stockId),
    );
    const tradeMessages$ = trades$.pipe(map(toTradeMessage));
    // 체결이 몰리면 마지막 체결 기준으로 한 번만 조회해 보낸다.
    const afterTradeMessages$ = trades$.pipe(
      auditTime(STREAM_THROTTLE_MS),
      concatMap((trade) =>
        from(this.afterTradeMessages(stockId, trade.createDate)).pipe(
          mergeMap((messages) => messages),
          catchError((error: unknown) => {
            this.logger.error(error);
            return EMPTY;
          }),
        ),
      ),
    );
    const orderbookMessages$ = this.matching.bookChanged$.pipe(
      filter((changedStockId) => changedStockId === stockId),
      auditTime(STREAM_THROTTLE_MS),
      map(() => this.orderbookMessage(stockId)),
    );

    // 보는 연결이 없으면 구독을 끊고, 다시 연결하면 새로 구독한다.
    const live$ = merge(
      tradeMessages$,
      afterTradeMessages$,
      orderbookMessages$,
    ).pipe(share());
    this.liveStreams.set(stockId, live$);
    return live$;
  }

  private async afterTradeMessages(
    stockId: number,
    at: Date,
  ): Promise<MessageEvent[]> {
    const [summary, items] = await Promise.all([
      this.summaryMessage(stockId),
      this.charts.getCurrentCandles(stockId, at),
    ]);
    return [summary, { type: 'candles', data: { stockId, items } }];
  }

  private async summaryMessage(stockId: number): Promise<MessageEvent> {
    return {
      type: 'summary',
      data: await this.charts.getDailySummary(stockId),
    };
  }

  private orderbookMessage(stockId: number): MessageEvent {
    const { asks, bids } = this.matching.depth(stockId, ORDER_BOOK_DEPTH);
    const toLevel = ({ price, qty }: { price: bigint; qty: bigint }) => ({
      price: Number(price),
      qty: Number(qty),
    });
    return {
      type: 'orderbook',
      data: { stockId, asks: asks.map(toLevel), bids: bids.map(toLevel) },
    };
  }
}

function toTradeMessage(trade: TradeExecutedEvent): MessageEvent {
  return {
    type: 'trade',
    data: {
      tradeId: Number(trade.tradeId),
      price: Number(trade.price),
      qty: Number(trade.qty),
      // 나중에 들어온 주문(ID가 큰 쪽)이 체결을 일으킨 쪽이다.
      side:
        trade.buyOrderId > trade.sellOrderId ? OrderSide.BUY : OrderSide.SELL,
      createDate: trade.createDate,
    },
  };
}
