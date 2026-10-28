import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module.js';
import { ChartsController } from './charts.controller.js';
import { ChartsService } from './charts.service.js';
import { MarketStreamService } from './market-stream.service.js';

@Module({
  imports: [MatchingModule],
  controllers: [ChartsController],
  providers: [ChartsService, MarketStreamService],
  exports: [ChartsService],
})
export class ChartsModule {}
