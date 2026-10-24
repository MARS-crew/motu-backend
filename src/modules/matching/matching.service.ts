import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Order, OrderStatus } from '../../generated/prisma/client.js';
import { Fill, IncomingOrder, matchOrder, MatchResult } from './matcher.js';
import { OrderBook } from './order-book.js';
import { KeyedSerialQueue } from './serial-queue.js';
import { ExecutedTrade } from './settlement.js';

/** 체결이 DB에 반영된 뒤 발행하는 이벤트. 차트·실시간 시세·알림이 구독한다. */
export interface TradeExecutedEvent {
  tradeId: bigint;
  stockId: number;
  buyOrderId: bigint;
  sellOrderId: bigint;
  buyAccountId: number;
  sellAccountId: number;
  price: bigint;
  qty: bigint;
  createDate: Date;
}

@Injectable()
export class MatchingService {
  /** 종목별 작업 순서. 같은 종목의 주문·체결·취소는 한 번에 하나씩 실행한다. */
  private readonly queue = new KeyedSerialQueue<number>();
  /** 종목별 호가창 (메모리). DB의 미체결 주문과 같아야 한다. */
  private readonly books = new Map<number, OrderBook>();
  private readonly tradeExecuted = new Subject<TradeExecutedEvent>();

  /** 체결 이벤트. 체결이 DB에 커밋된 뒤에만 발행한다. */
  readonly tradeExecuted$: Observable<TradeExecutedEvent> =
    this.tradeExecuted.asObservable();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 같은 종목의 다른 작업이 끝난 뒤에 task를 실행한다.
   * 호가창을 읽거나 바꾸는 작업(주문, 취소)은 모두 이 안에서 실행해야 한다.
   */
  runExclusive<T>(stockId: number, task: () => Promise<T>): Promise<T> {
    return this.queue.run(stockId, task);
  }

  getBook(stockId: number): OrderBook {
    let book = this.books.get(stockId);
    if (!book) {
      book = new OrderBook();
      this.books.set(stockId, book);
    }
    return book;
  }

  /** 새 주문이 그 종목의 호가창과 어떻게 체결되는지 계산한다. 호가창은 바꾸지 않는다. */
  match(stockId: number, incoming: IncomingOrder): MatchResult {
    return matchOrder(this.getBook(stockId), incoming);
  }

  /**
   * DB 커밋에 성공한 체결을 호가창에 반영한다.
   * 체결된 호가창 주문을 줄이고, 새 주문이 남아 있으면 호가창에 올린다.
   */
  apply(stockId: number, order: Order, fills: Fill[]): void {
    const book = this.getBook(stockId);
    for (const fill of fills) {
      book.reduce(fill.makerOrderId, fill.qty);
    }
    const isOpen =
      order.status === OrderStatus.ACCEPTED ||
      order.status === OrderStatus.PARTIAL;
    if (isOpen) {
      book.add({
        orderId: order.id,
        accountId: order.accountId,
        side: order.side,
        price: order.price,
        remainingQty: order.qty - order.filledQty,
      });
    }
  }

  /** DB 커밋에 성공한 체결을 알린다. */
  publishTrades(trades: ExecutedTrade[]): void {
    for (const { trade, buyAccountId, sellAccountId } of trades) {
      this.tradeExecuted.next({
        tradeId: trade.id,
        stockId: trade.stockId,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        buyAccountId,
        sellAccountId,
        price: trade.price,
        qty: trade.qty,
        createDate: trade.createDate,
      });
    }
  }
}
