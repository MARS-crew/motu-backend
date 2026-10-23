import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { MailModule } from './common/mail/mail.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { validateEnv } from './config/env.validation.js';
import { createLoggerOptions } from './config/logger.config.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HoldingsModule } from './modules/holdings/holdings.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { SearchHistoriesModule } from './modules/search-histories/search-histories.module.js';
import { SectorsModule } from './modules/sectors/sectors.module.js';
import { StocksModule } from './modules/stocks/stocks.module.js';
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
    AuthModule,
    SectorsModule,
    StocksModule,
    SearchHistoriesModule,
    OrdersModule,
    HoldingsModule,
  ],
})
export class AppModule {}
