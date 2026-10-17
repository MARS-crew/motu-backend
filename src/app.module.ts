import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { MailModule } from './common/mail/mail.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { validateEnv } from './config/env.validation.js';
import { createLoggerOptions } from './config/logger.config.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createLoggerOptions,
    }),
    PrismaModule,
    MailModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
