import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { VerificationsModule } from '../verifications/verifications.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AccountsModule, VerificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
