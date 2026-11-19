import { Module } from '@nestjs/common';
import { DailyStatsBatchService } from './daily-stats-batch.service.js';
import { DailyStatsService } from './daily-stats.service.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DailyStatsService, DailyStatsBatchService, DashboardService],
})
export class DashboardModule {}
