import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from './notifications.service.js';

describe('회원 알림', () => {
  const now = new Date('2026-10-26T00:00:00Z');
  const model = {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    createMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  const tx = { notification: model };
  const prisma = { notification: model, $transaction: vi.fn() };
  const service = new NotificationsService(prisma as unknown as PrismaService);
  const record = {
    id: 1,
    userId: 2,
    type: 'ORDER',
    eventKey: 'private',
    content: '체결 알림',
    payload: { stockId: 3 },
    isRead: false,
    readAt: null,
    createDate: now,
    modifiedDate: now,
  };
  const order = {
    userId: 2,
    tradeId: '9007199254740993',
    orderId: '2',
    stockId: 3,
    stockName: 'PLI',
    side: 'BUY' as const,
    quantity: '20',
    price: '4350',
    occurredAt: now,
  };
  const price = {
    userId: 2,
    alertId: '1',
    revision: 'v1',
    stockId: 3,
    stockName: 'PLI',
    targetPrice: '7000',
    reachedPrice: '7100',
    occurredAt: now,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((action: unknown) =>
      typeof action === 'function'
        ? action(tx)
        : Promise.all(action as Promise<unknown>[]),
    );
    model.findMany.mockResolvedValue([record]);
    model.count.mockResolvedValue(1);
    model.findFirst.mockResolvedValue(record);
    model.createMany.mockResolvedValue({ count: 1 });
    model.findUniqueOrThrow.mockResolvedValue(record);
  });

  it('본인의 발생 시각·ID 내림차순 목록을 조회하되 읽음 처리는 하지 않는다', async () => {
    const result = await service.list(2, 3, 20);
    expect(model.findMany).toHaveBeenCalledWith({
      where: { userId: 2 },
      orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
      skip: 40,
      take: 20,
    });
    expect(result.totalCount).toBe(1);
    expect(result.items[0]).not.toHaveProperty('eventKey');
    expect(result.items[0]).not.toHaveProperty('userId');
    expect(model.updateMany).not.toHaveBeenCalled();
  });
  it('읽지 않은 본인 알림만 카운트한다', async () => {
    expect(await service.unreadCount(2)).toEqual({ unreadCount: 1 });
    expect(model.count).toHaveBeenCalledWith({
      where: { userId: 2, isRead: false },
    });
  });
  it('타인의 알림과 없는 알림은 동일한 404이며 소유자 조건을 포함한다', async () => {
    model.findFirst.mockResolvedValue(null);
    await expect(service.markRead(8, 1)).rejects.toMatchObject({
      error: { code: 'NOTIFICATION_NOT_FOUND' },
    });
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { id: 1, userId: 8, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });
  it('이미 읽었으면 최초 읽음 시각을 보존한다', async () => {
    model.updateMany.mockResolvedValue({ count: 0 });
    model.findFirst.mockResolvedValue({ ...record, isRead: true, readAt: now });
    expect((await service.markRead(2, 1)).readAt).toEqual(now);
    expect(model.updateMany.mock.calls[0][0].where.isRead).toBe(false);
  });
  it.each([0, -1, 2147483648, Number.MAX_SAFE_INTEGER])(
    '범위를 벗어난 ID %s는 DB 오류 없이 404다',
    async (id) => {
      await expect(service.markRead(2, id)).rejects.toMatchObject({
        error: { code: 'NOTIFICATION_NOT_FOUND' },
      });
      expect(model.updateMany).not.toHaveBeenCalled();
    },
  );
  it('체결 ID를 문자열로 보존하고 거래·주문 단위 중복 키를 저장한다', async () => {
    const result = await service.createOrderFilled(order);
    expect(result.created).toBe(true);
    expect(model.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventKey: 'fill:9007199254740993:2',
          content: 'PLI·20주·매수 주문이 체결되었습니다.',
          payload: expect.objectContaining({
            tradeId: '9007199254740993',
            price: '4350',
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });
  it('매도 체결 문구를 구분한다', async () => {
    await service.createOrderFilled({ ...order, side: 'SELL' });
    expect(model.createMany.mock.calls[0][0].data[0].content).toContain('매도');
  });
  it('재전송은 내용과 읽음 상태를 덮어쓰지 않는다', async () => {
    model.createMany.mockResolvedValue({ count: 0 });
    model.findUniqueOrThrow.mockResolvedValue({
      ...record,
      isRead: true,
      readAt: now,
    });
    const result = await service.createOrderFilled(order);
    expect(result.created).toBe(false);
    expect(result.notification.isRead).toBe(true);
    expect(model.updateMany).not.toHaveBeenCalled();
  });
  it('생산자의 트랜잭션을 전달하면 별도 트랜잭션 없이 저장한다', async () => {
    await service.createOrderFilled(
      order,
      tx as unknown as Prisma.TransactionClient,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(model.createMany).toHaveBeenCalledTimes(1);
  });
  it('목표가 최초 도달은 알림 설정·수정 버전 단위로 중복을 막는다', async () => {
    await service.createTargetPriceReached(price);
    expect(model.createMany.mock.calls[0][0].data[0]).toMatchObject({
      type: 'PRICE',
      eventKey: 'price:1:v1',
      payload: { targetPrice: '7000', reachedPrice: '7100' },
    });
  });
  it('만료일 변경 시 새 경고 키를 사용하고 절대 만료일을 안내한다', async () => {
    await service.createDraftExpiring(
      {
        userId: 2,
        applicationId: 3,
        serviceName: null,
        expiresAt: new Date('2026-10-31T00:00:00Z'),
      },
      tx as unknown as Prisma.TransactionClient,
      now,
    );
    expect(model.createMany.mock.calls[0][0].data[0]).toMatchObject({
      type: 'LISTING_DRAFT_EXPIRING',
      eventKey: 'draft:3:2026-10-31T00:00:00.000Z',
      payload: { applicationId: 3, expiresAt: '2026-10-31T00:00:00.000Z' },
    });
  });
  it.each([
    { quantity: '0' },
    { price: '-1' },
    { quantity: '1.5' },
    { price: '9223372036854775808' },
    { tradeId: 'a:b' },
    { stockId: 0 },
    { userId: 0 },
    { stockName: '' },
    { occurredAt: new Date('invalid') },
  ])('잘못된 체결 이벤트는 저장하지 않는다 (%j)', async (patch) => {
    await expect(async () =>
      service.createOrderFilled({ ...order, ...patch }),
    ).rejects.toMatchObject({ error: { code: 'NOTIFICATION_INVALID_EVENT' } });
    expect(model.createMany).not.toHaveBeenCalled();
  });
  it('목표가격 0은 거부한다', () => {
    expect(() =>
      service.createTargetPriceReached({ ...price, targetPrice: '0' }),
    ).toThrow();
    expect(model.createMany).not.toHaveBeenCalled();
  });
});
