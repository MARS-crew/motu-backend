import { Logger } from '@nestjs/common';
import { ListingDraftExpirationService } from './listing-draft-expiration.service.js';
import type { ListingApplicationsService } from './listing-applications.service.js';
import { LISTING_DRAFT_SWEEP_INTERVAL_MS } from './listing-applications.constants.js';

describe('임시저장 주기 만료', () => {
  it('시작 시와 15분마다 실행하고 종료 시 타이머를 해제한다', async () => {
    vi.useFakeTimers();
    const expireDueDrafts = vi.fn().mockResolvedValue(0);
    const service = new ListingDraftExpirationService({
      expireDueDrafts,
    } as unknown as ListingApplicationsService);
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(expireDueDrafts).toHaveBeenCalledTimes(1);
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
    const service = new ListingDraftExpirationService({
      expireDueDrafts,
    } as unknown as ListingApplicationsService);
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
});
