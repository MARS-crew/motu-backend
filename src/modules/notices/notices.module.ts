import { Module } from '@nestjs/common';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { NoticesAdminController } from './notices-admin.controller.js';
import { NoticesAdminService } from './notices-admin.service.js';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';

@Module({
  imports: [AdminActivityLogsModule],
  controllers: [NoticesController, NoticesAdminController],
  providers: [NoticesService, NoticesAdminService],
})
export class NoticesModule {}
