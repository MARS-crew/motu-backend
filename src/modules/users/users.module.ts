import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { AnomaliesModule } from '../anomalies/anomalies.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { VerificationsModule } from '../verifications/verifications.module.js';
import { UsersAdminController } from './users-admin.controller.js';
import { UsersAdminService } from './users-admin.service.js';
import { UsersController } from './users.controller.js';
import { UsersWithdrawalService } from './users-withdrawal.service.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    AccountsModule,
    AdminActivityLogsModule,
    AnomaliesModule,
    OrdersModule,
    VerificationsModule,
  ],
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, UsersAdminService, UsersWithdrawalService],
  exports: [UsersService],
})
export class UsersModule {}
