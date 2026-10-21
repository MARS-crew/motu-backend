import { Module } from '@nestjs/common';
import { SearchHistoriesController } from './search-histories.controller.js';
import { SearchHistoriesService } from './search-histories.service.js';

@Module({
  controllers: [SearchHistoriesController],
  providers: [SearchHistoriesService],
  exports: [SearchHistoriesService],
})
export class SearchHistoriesModule {}
