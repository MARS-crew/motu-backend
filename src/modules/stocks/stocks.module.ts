import { Module } from '@nestjs/common';
import { ChartsModule } from '../charts/charts.module.js';
import { SearchHistoriesModule } from '../search-histories/search-histories.module.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';
import { WishlistsController } from './wishlists.controller.js';

@Module({
  imports: [SearchHistoriesModule, ChartsModule],
  controllers: [StocksController, WishlistsController],
  providers: [StocksService],
})
export class StocksModule {}
