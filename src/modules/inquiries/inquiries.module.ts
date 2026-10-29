import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { InquiriesController } from './inquiries.controller.js';
import { InquiriesService } from './inquiries.service.js';
import { InquiryAuthGuard } from './inquiry-auth.guard.js';
import { InquirySessionRateLimitGuard } from './inquiry-session-rate-limit.guard.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [InquiriesController],
  providers: [InquiriesService, InquiryAuthGuard, InquirySessionRateLimitGuard],
})
export class InquiriesModule {}
