import { Module } from '@nestjs/common';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { AnomaliesModule } from '../anomalies/anomalies.module.js';
import { ChartsModule } from '../charts/charts.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { SearchHistoriesModule } from '../search-histories/search-histories.module.js';
import { StocksAdminController } from './stocks-admin.controller.js';
import { StocksAdminService } from './stocks-admin.service.js';
import { StocksController } from './stocks.controller.js';
import { StocksService } from './stocks.service.js';
import { WishlistsController } from './wishlists.controller.js';

@Module({
  imports: [
    SearchHistoriesModule,
    ChartsModule,
    MatchingModule,
    AdminActivityLogsModule,
    AnomaliesModule,
  ],
  controllers: [StocksController, WishlistsController, StocksAdminController],
  providers: [StocksService, StocksAdminService],
})
export class StocksModule {}
