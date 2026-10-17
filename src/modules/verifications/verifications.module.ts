import { Module } from '@nestjs/common';
import { VerificationsService } from './verifications.service.js';

@Module({
  providers: [VerificationsService],
  exports: [VerificationsService],
})
export class VerificationsModule {}
