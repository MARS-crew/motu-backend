import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Order,
  OrderSide,
  OrderStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { Fill, IncomingOrder, matchOrder, MatchResult } from './matcher.js';
import { DepthLevel, OrderBook } from './order-book.js';
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

/** 호가창에 올라가는 주문 상태 */
const OPEN_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED,
  OrderStatus.PARTIAL,
];

@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly logger = new Logger(MatchingService.name);
  /** 종목별 작업 순서. 같은 종목의 주문·체결·취소는 한 번에 하나씩 실행한다. */
  private readonly queue = new KeyedSerialQueue<number>();
  /** 종목별 호가창 (메모리). DB의 미체결 주문과 같아야 한다. */
  private readonly books = new Map<number, OrderBook>();
  private readonly tradeExecuted = new Subject<TradeExecutedEvent>();

  /** 체결 이벤트. 체결이 DB에 커밋된 뒤에만 발행한다. */
  readonly tradeExecuted$: Observable<TradeExecutedEvent> =
    this.tradeExecuted.asObservable();
  private readonly bookChanged = new Subject<number>();

  /** 호가창이 바뀐 종목 ID. 커밋된 주문·체결·취소를 호가창에 반영한 뒤 발행한다. */
  readonly bookChanged$: Observable<number> = this.bookChanged.asObservable();

  constructor(private readonly prisma: PrismaService) {}

  /** 서버가 시작되면 DB의 미체결 주문으로 호가창을 만든다. */
  async onModuleInit(): Promise<void> {
    await this.restoreBooks();
  }

  /**
   * 모든 종목의 호가창을 DB의 미체결 주문으로 다시 만든다.
   * 주문 ID가 접수 순서이므로, ID 순서로 넣으면 같은 가격 안의 우선순위도 그대로다.
   */
  async restoreBooks(): Promise<void> {
    const orders = await this.findOpenOrders({});
    this.books.clear();
    for (const order of orders) {
      this.addToBook(this.getBook(order.stockId), order);
    }
    this.logger.log(
      `호가창 복구: 종목 ${this.books.size}개, 미체결 주문 ${orders.length}건`,
    );
  }

  /**
   * 한 종목의 호가창을 DB 기준으로 다시 만든다. 호가창과 DB가 어긋났을 때 쓴다.
   * 그 종목의 순서(runExclusive) 안에서 호출해야 한다.
   */
  async reloadBook(stockId: number): Promise<void> {
    const orders = await this.findOpenOrders({ stockId });
    const book = new OrderBook();
    for (const order of orders) {
      this.addToBook(book, order);
    }
    this.books.set(stockId, book);
    this.bookChanged.next(stockId);
    this.logger.warn(
      `호가창 다시 만들기: 종목 ${stockId}, 미체결 주문 ${orders.length}건`,
    );
  }

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
    if (OPEN_STATUSES.includes(order.status)) {
      this.addToBook(book, order);
    }
    this.bookChanged.next(stockId);
  }

  /** 좋은 가격부터 count단계의 매도·매수 호가 */
  depth(
    stockId: number,
    count: number,
  ): { asks: DepthLevel[]; bids: DepthLevel[] } {
    const book = this.getBook(stockId);
    return {
      asks: book.depth(OrderSide.SELL, count),
      bids: book.depth(OrderSide.BUY, count),
    };
  }

  /** DB 커밋에 성공한 거래 종료를 호가창에 반영한다. 그 종목의 호가창을 비운다. */
  clearBook(stockId: number): void {
    this.books.set(stockId, new OrderBook());
    this.bookChanged.next(stockId);
  }

  /** DB 커밋에 성공한 취소를 호가창에 반영한다. 호가창에 없으면 아무것도 하지 않는다. */
  removeOrder(stockId: number, orderId: bigint): void {
    this.getBook(stockId).remove(orderId);
    this.bookChanged.next(stockId);
  }

  private findOpenOrders(where: Prisma.OrderWhereInput) {
    return this.prisma.order.findMany({
      where: { ...where, status: { in: OPEN_STATUSES } },
      select: {
        id: true,
        stockId: true,
        accountId: true,
        side: true,
        price: true,
        qty: true,
        filledQty: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  private addToBook(
    book: OrderBook,
    order: Pick<
      Order,
      'id' | 'accountId' | 'side' | 'price' | 'qty' | 'filledQty'
    >,
  ): void {
    book.add({
      orderId: order.id,
      accountId: order.accountId,
      side: order.side,
      price: order.price,
      remainingQty: order.qty - order.filledQty,
    });
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
