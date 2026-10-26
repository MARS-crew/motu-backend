import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { SectorsModule } from '../sectors/sectors.module.js';
import { ListingApplicationsController } from './listing-applications.controller.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import { ListingDraftExpirationService } from './listing-draft-expiration.service.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';
import { ListingApplicationQueriesController } from './listing-application-queries.controller.js';

@Module({
  imports: [FilesModule, SectorsModule],
  controllers: [
    ListingApplicationsController,
    ListingApplicationQueriesController,
  ],
  providers: [
    ListingApplicationsService,
    ListingDraftExpirationService,
    ListingStepValidationService,
  ],
  exports: [ListingApplicationsService],
})
export class ListingApplicationsModule {}
