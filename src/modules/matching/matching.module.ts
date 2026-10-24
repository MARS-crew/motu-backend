import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service.js';
import { SettlementService } from './settlement.js';

@Module({
  providers: [MatchingService, SettlementService],
  exports: [MatchingService, SettlementService],
})
export class MatchingModule {}
