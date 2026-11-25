import { Module } from '@nestjs/common';
import { AdminLoginHistoriesService } from './admin-login-histories.service.js';

@Module({
  providers: [AdminLoginHistoriesService],
  exports: [AdminLoginHistoriesService],
})
export class AdminLoginHistoriesModule {}
