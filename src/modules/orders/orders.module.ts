import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [MatchingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
