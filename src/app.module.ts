import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { MailModule } from './common/mail/mail.module.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { validateEnv } from './config/env.validation.js';
import { createLoggerOptions } from './config/logger.config.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ChartsModule } from './modules/charts/charts.module.js';
import { FaqsModule } from './modules/faqs/faqs.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HoldingsModule } from './modules/holdings/holdings.module.js';
import { ListingApplicationsModule } from './modules/listing-applications/listing-applications.module.js';
import { MatchingModule } from './modules/matching/matching.module.js';
import { NoticesModule } from './modules/notices/notices.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PortfolioModule } from './modules/portfolio/portfolio.module.js';
import { PriceAlertsModule } from './modules/price-alerts/price-alerts.module.js';
import { SearchHistoriesModule } from './modules/search-histories/search-histories.module.js';
import { SectorsModule } from './modules/sectors/sectors.module.js';
import { StocksModule } from './modules/stocks/stocks.module.js';
import { TradeHistoriesModule } from './modules/trade-histories/trade-histories.module.js';
import { TradesModule } from './modules/trades/trades.module.js';
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
    FilesModule,
    ListingApplicationsModule,
    UsersModule,
    AuthModule,
    SectorsModule,
    StocksModule,
    SearchHistoriesModule,
    NoticesModule,
    NotificationsModule,
    FaqsModule,
    OrdersModule,
    HoldingsModule,
    MatchingModule,
    TradesModule,
    ChartsModule,
    PriceAlertsModule,
    PortfolioModule,
    TradeHistoriesModule,
  ],
})
export class AppModule {}
