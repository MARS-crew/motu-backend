import { AdminActivityLogsModule } from '../admin-activity-logs/admin-activity-logs.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { StocksModule } from '../stocks/stocks.module.js';
import { ListingReviewController } from './listing-review.controller.js';
import { ListingReviewService } from './listing-review.service.js';
import { ListingActivationService } from './listing-activation.service.js';
import { ListingStockImagesController } from './listing-stock-images.controller.js';
import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { SectorsModule } from '../sectors/sectors.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ListingApplicationsController } from './listing-applications.controller.js';
import { ListingApplicationsAdminController } from './listing-applications-admin.controller.js';
import { ListingApplicationsAdminService } from './listing-applications-admin.service.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import { ListingDraftExpirationService } from './listing-draft-expiration.service.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';
import { ListingApplicationQueriesController } from './listing-application-queries.controller.js';
import { ListingDraftNotificationsService } from './listing-draft-notifications.service.js';
import { ListingRevisionsController } from './listing-revisions.controller.js';
import { ListingRevisionsService } from './listing-revisions.service.js';

@Module({
  imports: [
    FilesModule,
    SectorsModule,
    NotificationsModule,
    AdminActivityLogsModule,
    MatchingModule,
    StocksModule,
  ],
  controllers: [
    ListingReviewController,
    ListingStockImagesController,
    ListingApplicationsController,
    ListingApplicationsAdminController,
    ListingApplicationQueriesController,
    ListingRevisionsController,
  ],
  providers: [
    ListingReviewService,
    ListingActivationService,
    ListingApplicationsService,
    ListingApplicationsAdminService,
    ListingDraftExpirationService,
    ListingDraftNotificationsService,
    ListingStepValidationService,
    ListingRevisionsService,
  ],
  exports: [ListingApplicationsService],
})
export class ListingApplicationsModule {}
