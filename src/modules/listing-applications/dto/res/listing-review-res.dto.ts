import { ApiProperty } from '@nestjs/swagger';
import { ListingApplicationStatus } from '../../../../generated/prisma/client.js';
export class ListingReviewResultResDto {
  @ApiProperty() applicationId: number;
  @ApiProperty({ type: String, nullable: true }) applicationNumber:
    string | null;
  @ApiProperty({ enum: ListingApplicationStatus })
  status: ListingApplicationStatus;
  @ApiProperty({ type: Number, nullable: true }) stockId: number | null;
  @ApiProperty({ type: Number, nullable: true }) revisionId: number | null;
  @ApiProperty({ type: Date, nullable: true }) revisionDeadline: Date | null;
}

export class ListingApprovalResDto {
  @ApiProperty({ example: '10000' }) finalPrice: string;
  @ApiProperty({ example: '100000' }) totalIssuedQuantity: string;
  @ApiProperty({ example: '2026-12-01' }) listingDate: string;
  @ApiProperty({ example: '2026-12-01T09:00:00+09:00' }) tradingStartAt: string;
  @ApiProperty() reason: string;
  @ApiProperty({ required: false }) priceAdjustmentReason?: string;
}
