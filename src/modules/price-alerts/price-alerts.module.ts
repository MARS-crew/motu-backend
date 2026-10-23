import { Module } from '@nestjs/common';
import { PriceAlertsController } from './price-alerts.controller.js';
import { PriceAlertsService } from './price-alerts.service.js';

@Module({
  controllers: [PriceAlertsController],
  providers: [PriceAlertsService],
})
export class PriceAlertsModule {}
