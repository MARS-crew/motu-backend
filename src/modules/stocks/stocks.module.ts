import { Module } from '@nestjs/common';
import { ChartsModule } from '../charts/charts.module.js';
import { SearchHistoriesModule } from '../search-histories/search-histories.module.js';
import { StocksAdminController } from './stocks-admin.controller.js';
import { StocksAdminService } from './stocks-admin.service.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';
import { WishlistsController } from './wishlists.controller.js';

@Module({
  imports: [SearchHistoriesModule, ChartsModule],
  controllers: [StocksController, WishlistsController, StocksAdminController],
  providers: [StocksService, StocksAdminService],
})
export class StocksModule {}
