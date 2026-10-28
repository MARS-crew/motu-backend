import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { NotificationType, Prisma } from '../../generated/prisma/client.js';
import type { Notification } from '../../generated/prisma/client.js';
import type { NotificationResDto } from './dto/res/notification-res.dto.js';
import type {
  DraftExpiringNotificationEvent,
  OrderFilledNotificationEvent,
  TargetPriceNotificationEvent,
} from './notification-event.type.js';
import { NotificationErrors as Errors } from './notifications.errors.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: number, page: number, size: number) {
    const [items, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * size,
          take: size,
        }),
        this.prisma.notification.count({ where: { userId } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: items.map((item) => this.toItem(item)),
      page,
      size,
      totalCount,
    };
  }

  async unreadCount(userId: number) {
    return {
      unreadCount: await this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    };
  }

  async markRead(userId: number, id: number) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
      throw new BusinessException(Errors.NOT_FOUND);
    // 소유자 조건을 갱신과 조회 모두에 적용해 타인 알림의 존재를 노출하지 않는다.
    return this.prisma.$transaction(async (tx) => {
      await tx.notification.updateMany({
        where: { id, userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      const item = await tx.notification.findFirst({ where: { id, userId } });
      if (!item) throw new BusinessException(Errors.NOT_FOUND);
      return this.toItem(item);
    });
  }

  /** 체결 확정 트랜잭션의 tx를 전달하면 체결과 알림이 함께 커밋/롤백된다. 부분 체결은 tradeId가 서로 달라야 한다. */
  createOrderFilled(
    event: OrderFilledNotificationEvent,
    tx?: Prisma.TransactionClient,
  ) {
    this.validateStockEvent(event);
    this.ensure(
      this.identifier(event.tradeId) &&
        this.identifier(event.orderId) &&
        ['BUY', 'SELL'].includes(event.side) &&
        this.positiveAmount(event.quantity) &&
        this.positiveAmount(event.price),
    );
    return this.store(
      event.userId,
      NotificationType.ORDER,
      `fill:${event.tradeId}:${event.orderId}`,
      `${event.stockName}·${event.quantity}주·${event.side === 'BUY' ? '매수' : '매도'} 주문이 체결되었습니다.`,
      {
        tradeId: event.tradeId,
        orderId: event.orderId,
        stockId: event.stockId,
        stockName: event.stockName,
        side: event.side,
        quantity: event.quantity,
        price: event.price,
      },
      event.occurredAt,
      tx,
    );
  }

  /** 가격 감지 담당자가 조건 충족을 확정한 후 호출한다. 같은 설정 버전의 재감지는 중복 저장하지 않는다. */
  createTargetPriceReached(
    event: TargetPriceNotificationEvent,
    tx?: Prisma.TransactionClient,
  ) {
    this.validateStockEvent(event);
    this.ensure(
      this.identifier(event.alertId) &&
        this.identifier(event.revision) &&
        this.positiveAmount(event.targetPrice) &&
        this.positiveAmount(event.reachedPrice),
    );
    return this.store(
      event.userId,
      NotificationType.PRICE,
      `price:${event.alertId}:${event.revision}`,
      `${event.stockName}·상품이 설정한 가격에 도달했습니다.`,
      {
        alertId: event.alertId,
        revision: event.revision,
        stockId: event.stockId,
        stockName: event.stockName,
        targetPrice: event.targetPrice,
        reachedPrice: event.reachedPrice,
      },
      event.occurredAt,
      tx,
    );
  }

  /** 작성 도메인이 유효한 DRAFT를 잠금 후 확인하고 같은 트랜잭션으로 호출한다. */
  createDraftExpiring(
    event: DraftExpiringNotificationEvent,
    tx: Prisma.TransactionClient,
    now = new Date(),
  ) {
    this.ensure(
      Number.isSafeInteger(event.applicationId) &&
        event.applicationId > 0 &&
        this.validDate(event.expiresAt) &&
        event.expiresAt > now &&
        (event.serviceName === null ||
          (typeof event.serviceName === 'string' &&
            event.serviceName.length <= 30)),
    );
    const date = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(event.expiresAt);
    return this.store(
      event.userId,
      NotificationType.LISTING_DRAFT_EXPIRING,
      `draft:${event.applicationId}:${event.expiresAt.toISOString()}`,
      `${event.serviceName || '작성 중인'} 임시저장 신청서가 ${date}에 만료됩니다. 계속 작성하려면 만료 전에 저장해 주세요.`,
      {
        applicationId: event.applicationId,
        serviceName: event.serviceName,
        expiresAt: event.expiresAt.toISOString(),
      },
      now,
      tx,
    );
  }

  private async store(
    userId: number,
    type: NotificationType,
    eventKey: string,
    content: string,
    payload: Prisma.InputJsonObject,
    createDate: Date,
    tx?: Prisma.TransactionClient,
  ) {
    this.ensure(
      Number.isSafeInteger(userId) && userId > 0 && this.validDate(createDate),
    );
    const persist = async (client: Prisma.TransactionClient) => {
      // 여러 인스턴스의 동시 재전송에도 기존 내용과 읽음 상태를 보존한다.
      const inserted = await client.notification.createMany({
        data: [{ userId, type, eventKey, content, payload, createDate }],
        skipDuplicates: true,
      });
      const item = await client.notification.findUniqueOrThrow({
        where: { userId_type_eventKey: { userId, type, eventKey } },
      });
      return { notification: this.toItem(item), created: inserted.count === 1 };
    };
    return tx ? persist(tx) : this.prisma.$transaction(persist);
  }

  private validateStockEvent(event: {
    stockId: number;
    stockName: string;
    occurredAt: Date;
  }) {
    this.ensure(
      Number.isSafeInteger(event.stockId) &&
        event.stockId > 0 &&
        typeof event.stockName === 'string' &&
        event.stockName.trim().length > 0 &&
        event.stockName.length <= 30 &&
        this.validDate(event.occurredAt),
    );
  }
  private identifier(value: string) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  }
  private positiveAmount(value: string) {
    return (
      typeof value === 'string' &&
      /^[1-9]\d{0,18}$/.test(value) &&
      BigInt(value) <= 9223372036854775807n
    );
  }
  private validDate(value: Date) {
    return value instanceof Date && Number.isFinite(value.getTime());
  }
  private ensure(condition: boolean): asserts condition {
    if (!condition) throw new BusinessException(Errors.INVALID_EVENT);
  }
  private toItem(item: Notification): NotificationResDto {
    return {
      id: item.id,
      type: item.type,
      content: item.content,
      payload: item.payload as Record<string, unknown>,
      isRead: item.isRead,
      readAt: item.readAt,
      createDate: item.createDate,
    };
  }
}
