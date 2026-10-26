import { Logger } from '@nestjs/common';
import { ListingDraftExpirationService } from './listing-draft-expiration.service.js';
import type { ListingApplicationsService } from './listing-applications.service.js';
import type { ListingDraftNotificationsService } from './listing-draft-notifications.service.js';
import { LISTING_DRAFT_SWEEP_INTERVAL_MS } from './listing-applications.constants.js';

describe('임시저장 주기 만료', () => {
  it('시작 시와 15분마다 실행하고 종료 시 타이머를 해제한다', async () => {
    vi.useFakeTimers();
    const expireDueDrafts = vi.fn().mockResolvedValue(0);
    const notifyExpiringDrafts = vi.fn().mockResolvedValue(0);
    const service = new ListingDraftExpirationService(
      {
        expireDueDrafts,
      } as unknown as ListingApplicationsService,
      { notifyExpiringDrafts } as unknown as ListingDraftNotificationsService,
    );
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(expireDueDrafts).toHaveBeenCalledTimes(1);
      expect(notifyExpiringDrafts).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(LISTING_DRAFT_SWEEP_INTERVAL_MS);
      expect(expireDueDrafts).toHaveBeenCalledTimes(2);
      service.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(LISTING_DRAFT_SWEEP_INTERVAL_MS);
      expect(expireDueDrafts).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
      vi.useRealTimers();
    }
  });
  it('실패해도 다음 주기에 다시 시도한다', async () => {
    vi.useFakeTimers();
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const expireDueDrafts = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(1);
    const service = new ListingDraftExpirationService(
      {
        expireDueDrafts,
      } as unknown as ListingApplicationsService,
      {
        notifyExpiringDrafts: vi.fn().mockResolvedValue(0),
      } as unknown as ListingDraftNotificationsService,
    );
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(LISTING_DRAFT_SWEEP_INTERVAL_MS);
      expect(expireDueDrafts).toHaveBeenCalledTimes(2);
      expect(logger).toHaveBeenCalled();
    } finally {
      service.onModuleDestroy();
      vi.useRealTimers();
      logger.mockRestore();
    }
  });
  it('알림 조회 실패가 기존 만료 처리를 막지 않는다', async () => {
    vi.useFakeTimers();
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const expireDueDrafts = vi.fn().mockResolvedValue(0);
    const notifyExpiringDrafts = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(0);
    const service = new ListingDraftExpirationService(
      { expireDueDrafts } as unknown as ListingApplicationsService,
      { notifyExpiringDrafts } as unknown as ListingDraftNotificationsService,
    );
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(expireDueDrafts).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(LISTING_DRAFT_SWEEP_INTERVAL_MS);
      expect(notifyExpiringDrafts).toHaveBeenCalledTimes(2);
      expect(expireDueDrafts).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
      vi.useRealTimers();
      logger.mockRestore();
    }
  });
  it('이전 알림 작업이 진행 중이면 주기 실행이 겹치지 않는다', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const notifyExpiringDrafts = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const expireDueDrafts = vi.fn().mockResolvedValue(0);
    const service = new ListingDraftExpirationService(
      { expireDueDrafts } as unknown as ListingApplicationsService,
      { notifyExpiringDrafts } as unknown as ListingDraftNotificationsService,
    );
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(LISTING_DRAFT_SWEEP_INTERVAL_MS);
      expect(notifyExpiringDrafts).toHaveBeenCalledTimes(1);
      expect(expireDueDrafts).not.toHaveBeenCalled();
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(expireDueDrafts).toHaveBeenCalledTimes(1);
    } finally {
      service.onModuleDestroy();
      vi.useRealTimers();
    }
  });
});
