import { Module } from '@nestjs/common';
import { ChartsModule } from '../charts/charts.module.js';
import { PriceAlertsController } from './price-alerts.controller.js';
import { PriceAlertsService } from './price-alerts.service.js';

@Module({
  imports: [ChartsModule],
  controllers: [PriceAlertsController],
  providers: [PriceAlertsService],
})
export class PriceAlertsModule {}
