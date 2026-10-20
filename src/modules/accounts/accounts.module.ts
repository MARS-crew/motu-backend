import { Module } from '@nestjs/common';
import { AccountsAdminController } from './accounts-admin.controller.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  controllers: [AccountsController, AccountsAdminController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
