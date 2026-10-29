import { Module } from '@nestjs/common';
import { VerificationsModule } from '../verifications/verifications.module.js';
import { TwoFactorController } from './two-factor.controller.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  imports: [VerificationsModule],
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
