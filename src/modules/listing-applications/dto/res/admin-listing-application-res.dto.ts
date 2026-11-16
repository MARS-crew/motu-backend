import { ApiProperty } from '@nestjs/swagger';
import type { ListingApplicationStatus } from '../../../../generated/prisma/client.js';
import { CollectionResDto } from '../../../files/dto/res/attachment-res.dto.js';
import { REVIEWABLE_LISTING_STATUSES } from '../../listing-applications.constants.js';
import { ListingDraftDataReqDto } from '../req/listing-draft-data-req.dto.js';
import { ListingApplicationAttachmentsResDto } from './listing-application-res.dto.js';

export class AdminListingApplicantResDto {
  @ApiProperty() userId: number;
  @ApiProperty() loginId: string;
  @ApiProperty() nickname: string;
}

export class AdminListingApplicationItemResDto {
  @ApiProperty() id: number;
  @ApiProperty({ type: String }) applicationNumber: string | null;
  @ApiProperty({ type: String, nullable: true }) serviceName: string | null;
  @ApiProperty({ type: Number, nullable: true }) sectorCode: number | null;
  @ApiProperty({ type: String, nullable: true }) sectorName: string | null;
  @ApiProperty({ type: Date }) submittedAt: Date | null;
  @ApiProperty({ enum: [...REVIEWABLE_LISTING_STATUSES] })
  status: ListingApplicationStatus;
  @ApiProperty() statusLabel: string;
  @ApiProperty({ type: AdminListingApplicantResDto })
  applicant: AdminListingApplicantResDto;
}

export class GetAdminListingApplicationsResDto {
  @ApiProperty({ type: [AdminListingApplicationItemResDto] })
  items: AdminListingApplicationItemResDto[];
  @ApiProperty() page: number;
  @ApiProperty() size: number;
  @ApiProperty() totalCount: number;
}

export class AdminListingRevisionResDto {
  @ApiProperty() id: number;
  @ApiProperty() requestContent: string;
  @ApiProperty() deadline: Date;
  @ApiProperty() createDate: Date;
  @ApiProperty({ type: Date, nullable: true }) resubmittedAt: Date | null;
  @ApiProperty({ type: CollectionResDto, nullable: true })
  evidence: CollectionResDto | null;
}

export class AdminListingApplicationResDto extends AdminListingApplicationItemResDto {
  @ApiProperty({ type: String, nullable: true }) reviewComment: string | null;
  @ApiProperty({ type: Date, nullable: true }) revisionDeadline: Date | null;
  @ApiProperty({ type: ListingDraftDataReqDto }) data: ListingDraftDataReqDto;
  @ApiProperty({ type: ListingApplicationAttachmentsResDto })
  attachments: ListingApplicationAttachmentsResDto;
  @ApiProperty({ type: [AdminListingRevisionResDto] })
  revisions: AdminListingRevisionResDto[];
}
