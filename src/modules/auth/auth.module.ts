import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { AdminPasswordChangeGuard } from '../admin-accounts/admin-password-change.guard.js';
import { AdminLoginHistoriesModule } from '../admin-login-histories/admin-login-histories.module.js';
import { TwoFactorModule } from '../two-factor/two-factor.module.js';
import { UsersModule } from '../users/users.module.js';
import { VerificationsModule } from '../verifications/verifications.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [
    AdminLoginHistoriesModule,
    UsersModule,
    VerificationsModule,
    TwoFactorModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // 등록 순서대로 실행된다: 로그인 확인 → 역할 확인 → 관리자 임시 비밀번호 상태 확인
    // AdminPasswordChangeGuard는 JwtAuthGuard가 채운 request.user를 쓰므로 반드시 이 뒤에 둔다.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AdminPasswordChangeGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
