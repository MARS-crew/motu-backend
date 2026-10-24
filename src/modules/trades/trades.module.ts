import { Module } from '@nestjs/common';
import { TradesController } from './trades.controller.js';
import { TradesService } from './trades.service.js';

@Module({
  controllers: [TradesController],
  providers: [TradesService],
})
export class TradesModule {}
