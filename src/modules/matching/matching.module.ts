import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MatchingService } from './matching.service.js';
import { SettlementService } from './settlement.js';
import { StockTradingService } from './stock-trading.service.js';

@Module({
  imports: [NotificationsModule],
  providers: [MatchingService, SettlementService, StockTradingService],
  exports: [MatchingService, SettlementService, StockTradingService],
})
export class MatchingModule {}
