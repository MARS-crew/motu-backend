import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { ListingApplicationsController } from './listing-applications.controller.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import { ListingDraftExpirationService } from './listing-draft-expiration.service.js';

@Module({
  imports: [FilesModule],
  controllers: [ListingApplicationsController],
  providers: [ListingApplicationsService, ListingDraftExpirationService],
  exports: [ListingApplicationsService],
})
export class ListingApplicationsModule {}
