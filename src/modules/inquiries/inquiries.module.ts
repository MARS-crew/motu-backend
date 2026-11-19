import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { InquiriesAdminController } from './inquiries-admin.controller.js';
import { InquiriesAdminService } from './inquiries-admin.service.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { InquiriesController } from './inquiries.controller.js';
import { InquiriesService } from './inquiries.service.js';
import { InquiryAuthGuard } from './inquiry-auth.guard.js';
import { AccountInquiriesController } from './account-inquiries.controller.js';
import { AccountInquiriesService } from './account-inquiries.service.js';
import { InquirySubmissionLimiter } from './inquiry-submission-limiter.service.js';

@Module({
  imports: [
    AdminActivityLogsModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [
    InquiriesController,
    InquiriesAdminController,
    AccountInquiriesController,
  ],
  providers: [
    InquiriesService,
    InquiriesAdminService,
    InquiryAuthGuard,
    AccountInquiriesService,
    InquirySubmissionLimiter,
  ],
})
export class InquiriesModule {}
