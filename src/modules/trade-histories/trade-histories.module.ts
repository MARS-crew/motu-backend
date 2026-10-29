import { Module } from '@nestjs/common';
import { TradeHistoriesController } from './trade-histories.controller.js';
import { TradeHistoriesService } from './trade-histories.service.js';

@Module({
  controllers: [TradeHistoriesController],
  providers: [TradeHistoriesService],
})
export class TradeHistoriesModule {}
