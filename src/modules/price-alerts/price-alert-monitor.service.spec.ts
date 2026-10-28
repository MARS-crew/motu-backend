import { Subject } from 'rxjs';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  MatchingService,
  TradeExecutedEvent,
} from '../matching/matching.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PriceAlertMonitorService } from './price-alert-monitor.service.js';

const STOCK_ID = 1;
const TRADE_DATE = new Date('2026-10-28T02:00:00.000Z');

describe('PriceAlertMonitorService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    priceAlert: { update: vi.fn() },
  };
  const prisma = {
    priceAlert: { findMany: vi.fn() },
    trade: { findFirst: vi.fn() },
    stock: { findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const notifications = { createTargetPriceReached: vi.fn() };
  let trades: Subject<TradeExecutedEvent>;
  let service: PriceAlertMonitorService;

  const tradeOf = (tradeId: bigint, price: bigint): TradeExecutedEvent => ({
    tradeId,
    stockId: STOCK_ID,
    buyOrderId: 1n,
    sellOrderId: 2n,
    buyAccountId: 1,
    sellAccountId: 2,
    price,
    qty: 1n,
    createDate: TRADE_DATE,
  });

  /** 잠근 알림 행 */
  const lockedOf = (overrides: Record<string, unknown> = {}) => ({
    alert_id: 12,
    user_id: 7,
    target_price: 7_000n,
    is_active: true,
    version: 3n,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    trades = new Subject();
    service = new PriceAlertMonitorService(
      prisma as unknown as PrismaService,
      { tradeExecuted$: trades.asObservable() } as unknown as MatchingService,
      notifications as unknown as NotificationsService,
    );
    prisma.stock.findUniqueOrThrow.mockResolvedValue({
      name: 'PLI',
      basePrice: 5_000n,
    });
    prisma.trade.findFirst.mockResolvedValue({ price: 6_990n });
    prisma.priceAlert.findMany.mockResolvedValue([{ id: 12, version: 3n }]);
    tx.$queryRaw.mockResolvedValue([lockedOf()]);
  });

  it('서버가 뜬 뒤 첫 체결이면 직전 체결가를 DB에서 찾고, 그 사이에 걸친 켜진 알림을 찾는다', async () => {
    await service.handleTrade(tradeOf(50n, 7_010n));

    expect(prisma.trade.findFirst).toHaveBeenCalledWith({
      where: { stockId: STOCK_ID, id: { lt: 50n } },
      orderBy: { id: 'desc' },
      select: { price: true },
    });
    expect(prisma.priceAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stockId: STOCK_ID,
          isActive: true,
          targetPrice: { gte: 6_990n, lte: 7_010n },
          // 체결 뒤에 등록·수정한 알림은 이 체결로 울리지 않는다.
          modifiedDate: { lte: TRADE_DATE },
        },
      }),
    );
  });

  it('체결이 처음이면 기준가를 직전 가격으로 본다', async () => {
    prisma.trade.findFirst.mockResolvedValue(null);

    await service.handleTrade(tradeOf(50n, 4_800n));

    expect(prisma.priceAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetPrice: { gte: 4_800n, lte: 5_000n },
        }),
      }),
    );
  });

  it('다음 체결부터는 메모리의 직전 체결가를 쓴다 (가격이 내려가도 범위를 맞게 잡는다)', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([]);
    await service.handleTrade(tradeOf(50n, 7_010n));
    await service.handleTrade(tradeOf(51n, 6_500n));

    expect(prisma.trade.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.priceAlert.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetPrice: { gte: 6_500n, lte: 7_010n },
        }),
      }),
    );
  });

  it('도달한 알림을 끄고 같은 트랜잭션에서 버전을 revision으로 알림을 만든다', async () => {
    await service.handleTrade(tradeOf(50n, 7_010n));

    expect(tx.priceAlert.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { isActive: false, triggeredDate: TRADE_DATE },
    });
    expect(notifications.createTargetPriceReached).toHaveBeenCalledWith(
      {
        userId: 7,
        alertId: '12',
        revision: '3',
        stockId: STOCK_ID,
        stockName: 'PLI',
        targetPrice: '7000',
        reachedPrice: '7010',
        occurredAt: TRADE_DATE,
      },
      tx,
    );
  });

  it.each([
    ['그 사이 수정돼 버전이 바뀌었으면', [lockedOf({ version: 4n })]],
    ['그 사이 다른 감지로 꺼졌으면', [lockedOf({ is_active: false })]],
    ['그 사이 해제됐으면', []],
  ])('%s 알리지 않는다', async (_, rows) => {
    tx.$queryRaw.mockResolvedValue(rows);

    await service.handleTrade(tradeOf(50n, 7_010n));

    expect(tx.priceAlert.update).not.toHaveBeenCalled();
    expect(notifications.createTargetPriceReached).not.toHaveBeenCalled();
  });

  it('도달한 알림이 없으면 트랜잭션을 열지 않는다', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([]);

    await service.handleTrade(tradeOf(50n, 7_010n));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('한 알림이 실패해도 나머지 알림은 계속 확인한다', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([
      { id: 12, version: 3n },
      { id: 13, version: 0n },
    ]);
    tx.$queryRaw
      .mockRejectedValueOnce(new Error('잠금 실패'))
      .mockResolvedValueOnce([lockedOf({ alert_id: 13, version: 0n })]);

    await service.handleTrade(tradeOf(50n, 7_010n));

    expect(notifications.createTargetPriceReached).toHaveBeenCalledTimes(1);
    expect(notifications.createTargetPriceReached).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: '13', revision: '0' }),
      tx,
    );
  });

  it('조회가 실패해도 예외를 던지지 않는다', async () => {
    prisma.priceAlert.findMany.mockRejectedValue(new Error('DB 오류'));

    await expect(
      service.handleTrade(tradeOf(50n, 7_010n)),
    ).resolves.toBeUndefined();
  });

  it('체결 이벤트를 구독해 종목별로 순서대로 처리한다', async () => {
    prisma.priceAlert.findMany.mockResolvedValue([]);
    service.onModuleInit();

    trades.next(tradeOf(50n, 7_010n));
    trades.next(tradeOf(51n, 6_500n));
    await vi.waitFor(() =>
      expect(prisma.priceAlert.findMany).toHaveBeenCalledTimes(2),
    );
    service.onModuleDestroy();

    expect(
      prisma.priceAlert.findMany.mock.calls[1][0].where.targetPrice,
    ).toEqual({ gte: 6_500n, lte: 7_010n });
  });
});
