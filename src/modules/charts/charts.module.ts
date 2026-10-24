import { Module } from '@nestjs/common';
import { ChartsController } from './charts.controller.js';
import { ChartsService } from './charts.service.js';

@Module({
  controllers: [ChartsController],
  providers: [ChartsService],
  exports: [ChartsService],
})
export class ChartsModule {}
