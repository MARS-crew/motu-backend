import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { AdminAccountsController } from './admin-accounts.controller.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AdminPasswordChangeGuard } from './admin-password-change.guard.js';

@Module({
  imports: [AdminActivityLogsModule],
  controllers: [AdminAccountsController],
  providers: [
    AdminAccountsService,
    // 다른 모듈의 관리자 API에도 적용되도록 전역 Guard로 둔다.
    { provide: APP_GUARD, useClass: AdminPasswordChangeGuard },
  ],
})
export class AdminAccountsModule {}
