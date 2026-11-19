import { Module } from '@nestjs/common';
import { DailyStatsBatchService } from './daily-stats-batch.service.js';
import { DailyStatsService } from './daily-stats.service.js';

@Module({
  providers: [DailyStatsService, DailyStatsBatchService],
})
export class DashboardModule {}
