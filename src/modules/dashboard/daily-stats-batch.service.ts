import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DAILY_STATS_SWEEP_INTERVAL_MS } from './dashboard.constants.js';
import { DailyStatsService } from './daily-stats.service.js';

/**
 * 일별 통계 배치. 서버가 뜰 때와 10분마다 마감한 날의 행을 채운다. 서버가 꺼져 있던 날도 다음 실행에서 채운다.
 */
@Injectable()
export class DailyStatsBatchService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(DailyStatsBatchService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly dailyStats: DailyStatsService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(
      () => void this.sweep(),
      DAILY_STATS_SWEEP_INTERVAL_MS,
    );
    this.timer.unref();
    void this.sweep();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      await this.dailyStats.collectClosedDays();
    } catch (error) {
      this.logger.error(
        '일별 통계 집계 실패',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
