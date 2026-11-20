import { Logger } from '@nestjs/common';
import { DAILY_STATS_SWEEP_INTERVAL_MS } from './dashboard.constants.js';
import { DailyStatsBatchService } from './daily-stats-batch.service.js';
import type { DailyStatsService } from './daily-stats.service.js';

describe('일별 통계 배치', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('시작 시와 10분마다 실행하고 종료 시 타이머를 해제한다', async () => {
    vi.useFakeTimers();
    const collectClosedDays = vi.fn().mockResolvedValue(0);
    const service = new DailyStatsBatchService({
      collectClosedDays,
    } as unknown as DailyStatsService);
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(collectClosedDays).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(DAILY_STATS_SWEEP_INTERVAL_MS);
      expect(collectClosedDays).toHaveBeenCalledTimes(2);
      service.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(DAILY_STATS_SWEEP_INTERVAL_MS);
      expect(collectClosedDays).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
    }
  });

  it('집계가 실패해도 로그만 남기고 다음 주기에 다시 실행한다', async () => {
    vi.useFakeTimers();
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const collectClosedDays = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(1);
    const service = new DailyStatsBatchService({
      collectClosedDays,
    } as unknown as DailyStatsService);
    try {
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(0);
      expect(error).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(DAILY_STATS_SWEEP_INTERVAL_MS);
      expect(collectClosedDays).toHaveBeenCalledTimes(2);
    } finally {
      service.onModuleDestroy();
    }
  });
});
