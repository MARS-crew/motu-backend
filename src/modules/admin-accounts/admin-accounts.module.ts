import { Module } from '@nestjs/common';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { AdminAccountsController } from './admin-accounts.controller.js';
import { AdminAccountsService } from './admin-accounts.service.js';

@Module({
  imports: [AdminActivityLogsModule],
  controllers: [AdminAccountsController],
  // 임시 비밀번호 상태 확인 Guard(AdminPasswordChangeGuard)는 실행 순서를 위해 AuthModule에서 등록한다.
  providers: [AdminAccountsService],
})
export class AdminAccountsModule {}
