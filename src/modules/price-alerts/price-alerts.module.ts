import { Module } from '@nestjs/common';
import { ChartsModule } from '../charts/charts.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PriceAlertMonitorService } from './price-alert-monitor.service.js';
import { PriceAlertsController } from './price-alerts.controller.js';
import { PriceAlertsService } from './price-alerts.service.js';

@Module({
  imports: [ChartsModule, MatchingModule, NotificationsModule],
  controllers: [PriceAlertsController],
  providers: [PriceAlertsService, PriceAlertMonitorService],
})
export class PriceAlertsModule {}
