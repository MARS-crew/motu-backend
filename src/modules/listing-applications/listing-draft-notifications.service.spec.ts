import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { ListingDraftNotificationsService } from './listing-draft-notifications.service.js';

describe('임시저장 만료 7일 전 안내', () => {
  const now = new Date('2026-10-26T00:00:00Z');
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const lock = vi.fn();
  const tx = { $queryRaw: lock, listingApplication: { findFirst } };
  const prisma = { listingApplication: { findMany }, $transaction: vi.fn() };
  const notifications = { createDraftExpiring: vi.fn() };
  const service = new ListingDraftNotificationsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.$transaction.mockImplementation(
      (action: (client: typeof tx) => Promise<unknown>) => action(tx),
    );
    findMany.mockResolvedValue([{ id: 1, userId: 2 }]);
    lock.mockResolvedValue([{ user_id: 2 }]);
    findFirst.mockResolvedValue({
      id: 1,
      userId: 2,
      serviceName: 'PLI',
      expiresAt: new Date(now.getTime() + 7 * 86400000),
    });
    notifications.createDraftExpiring.mockResolvedValue({ created: true });
  });
  afterEach(() => vi.useRealTimers());
  it('정확히 7일 경계부터, 만료 시각 미만까지의 유효한 DRAFT만 선택한다', async () => {
    expect(await service.notifyExpiringDrafts()).toBe(1);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      status: 'DRAFT',
      deletedDate: null,
      expiresAt: { gt: now, lte: new Date('2026-11-02T00:00:00Z') },
    });
    expect(notifications.createDraftExpiring).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, applicationId: 1 }),
      tx,
      now,
    );
    expect(lock).toHaveBeenCalled();
  });
  it('조회 이후 저장 연장·삭제·접수된 신청서는 잠금 후 제외한다', async () => {
    findFirst.mockResolvedValue(null);
    expect(await service.notifyExpiringDrafts()).toBe(0);
    expect(notifications.createDraftExpiring).not.toHaveBeenCalled();
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      id: 1,
      userId: 2,
      status: 'DRAFT',
      deletedDate: null,
    });
  });
  it('같은 만료일의 기존 안내는 생성 건수에 포함하지 않는다', async () => {
    notifications.createDraftExpiring.mockResolvedValue({ created: false });
    expect(await service.notifyExpiringDrafts()).toBe(0);
  });
  it('100건씩 순회하며 한 건 실패가 나머지 안내를 막지 않는다', async () => {
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    findMany
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          userId: 2,
        })),
      )
      .mockResolvedValueOnce([{ id: 101, userId: 2 }]);
    notifications.createDraftExpiring
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ created: true });
    try {
      expect(await service.notifyExpiringDrafts()).toBe(100);
      expect(findMany.mock.calls[1][0].where.id).toEqual({ gt: 100 });
      expect(logger).toHaveBeenCalledTimes(1);
    } finally {
      logger.mockRestore();
    }
  });
});
