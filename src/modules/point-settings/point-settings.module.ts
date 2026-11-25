import { Module } from '@nestjs/common';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { PointSettingsController } from './point-settings.controller.js';
import { PointSettingsService } from './point-settings.service.js';

@Module({
  imports: [AdminActivityLogsModule],
  controllers: [PointSettingsController],
  providers: [PointSettingsService],
  exports: [PointSettingsService],
})
export class PointSettingsModule {}
