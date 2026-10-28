import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Subscription } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { KeyedSerialQueue } from '../matching/serial-queue.js';
import {
  MatchingService,
  TradeExecutedEvent,
} from '../matching/matching.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** SELECT ... FOR UPDATE로 잠근 알림 행 */
interface LockedAlertRow {
  alert_id: number;
  user_id: number;
  target_price: bigint;
  is_active: boolean;
  version: bigint;
}

/**
 * 체결을 보고 설정 가격에 도달한 지정가 알림을 울린다.
 * 직전 체결가와 이번 체결가 사이(양 끝 포함)에 설정 가격이 있으면 도달로 본다. 가격이 설정 가격을 건너뛰어도 울린다.
 */
@Injectable()
export class PriceAlertMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceAlertMonitorService.name);
  /** 종목별 순서. 직전 체결가를 체결 순서대로 이어 받는다. 주문 처리 순서와는 따로 돈다. */
  private readonly queue = new KeyedSerialQueue<number>();
  /** 종목별로 마지막으로 확인한 체결가 */
  private readonly lastPrices = new Map<number, bigint>();
  private subscription?: Subscription;

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.matching.tradeExecuted$.subscribe((event) => {
      void this.queue.run(event.stockId, () => this.handleTrade(event));
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /**
   * 체결 하나를 확인한다. 실패해도 체결에는 영향이 없으므로 로그만 남긴다.
   */
  async handleTrade(event: TradeExecutedEvent): Promise<void> {
    try {
      const previousPrice =
        this.lastPrices.get(event.stockId) ??
        (await this.findPreviousPrice(event));
      this.lastPrices.set(event.stockId, event.price);

      const [low, high] =
        previousPrice < event.price
          ? [previousPrice, event.price]
          : [event.price, previousPrice];
      const candidates = await this.prisma.priceAlert.findMany({
        where: {
          stockId: event.stockId,
          isActive: true,
          targetPrice: { gte: low, lte: high },
          // 감지가 체결 커밋 뒤에 돌아서, 그 사이 등록·수정한 알림은 이 체결로 울리지 않게 한다.
          modifiedDate: { lte: event.createDate },
        },
        select: { id: true, version: true },
        orderBy: { id: 'asc' },
      });
      if (candidates.length === 0) {
        return;
      }

      const { name: stockName } = await this.prisma.stock.findUniqueOrThrow({
        where: { id: event.stockId },
        select: { name: true },
      });
      for (const candidate of candidates) {
        await this.trigger(candidate, event, stockName);
      }
    } catch (error) {
      this.logger.error(
        `지정가 알림 확인 실패: stock=${event.stockId} trade=${event.tradeId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * 알림 하나를 끄고 같은 트랜잭션에서 알림 내역을 만든다.
   * 그 사이 수정(version 변경)·해제·다른 감지로 바뀌었으면 건너뛴다. 수정한 알림은 이후 체결부터 본다.
   */
  private async trigger(
    candidate: { id: number; version: bigint },
    event: TradeExecutedEvent,
    stockName: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const [alert] = await tx.$queryRaw<LockedAlertRow[]>`
          SELECT alert_id, user_id, target_price, is_active, version
          FROM price_alerts
          WHERE alert_id = ${candidate.id}
          FOR UPDATE
        `;
        if (!alert?.is_active || alert.version !== candidate.version) {
          return;
        }

        await tx.priceAlert.update({
          where: { id: alert.alert_id },
          data: { isActive: false, triggeredDate: event.createDate },
        });
        await this.notifications.createTargetPriceReached(
          {
            userId: alert.user_id,
            alertId: String(alert.alert_id),
            revision: alert.version.toString(),
            stockId: event.stockId,
            stockName,
            targetPrice: alert.target_price.toString(),
            reachedPrice: event.price.toString(),
            occurredAt: event.createDate,
          },
          tx,
        );
      });
    } catch (error) {
      // 한 알림이 실패해도 나머지 알림은 계속 확인한다.
      this.logger.error(
        `지정가 알림 발송 실패: alert=${candidate.id} trade=${event.tradeId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * 서버가 뜬 뒤 그 종목의 첫 체결이면 직전 체결가를 DB에서 찾는다. 체결이 처음이면 기준가다.
   */
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
}
