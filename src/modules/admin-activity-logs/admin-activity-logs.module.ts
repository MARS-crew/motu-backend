import { Module } from '@nestjs/common';
import { AdminActivityLogsController } from './admin-activity-logs.controller.js';
import { AdminActivityLogsService } from './admin-activity-logs.service.js';

@Module({
  controllers: [AdminActivityLogsController],
  providers: [AdminActivityLogsService],
  exports: [AdminActivityLogsService],
})
export class AdminActivityLogsModule {}
