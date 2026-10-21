import { Module } from '@nestjs/common';
import { SearchHistoriesModule } from '../search-histories/search-histories.module.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';

@Module({
  imports: [SearchHistoriesModule],
  controllers: [StocksController],
  providers: [StocksService],
})
export class StocksModule {}
