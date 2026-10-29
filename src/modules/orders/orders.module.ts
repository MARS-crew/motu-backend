import { Module } from '@nestjs/common';
import { ChartsModule } from '../charts/charts.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { TwoFactorModule } from '../two-factor/two-factor.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [MatchingModule, ChartsModule, TwoFactorModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
