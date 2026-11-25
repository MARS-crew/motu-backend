import { Module } from '@nestjs/common';
import { PointSettingsModule } from '../point-settings/point-settings.module.js';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { AccountsAdminController } from './accounts-admin.controller.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  imports: [AdminActivityLogsModule, PointSettingsModule],
  controllers: [AccountsController, AccountsAdminController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
