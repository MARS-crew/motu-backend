import { ApiProperty } from '@nestjs/swagger';
import { ListingApplicationStatus } from '../../../../generated/prisma/client.js';
import { ListingDraftDataReqDto } from '../req/listing-draft-data-req.dto.js';

export class ListingDraftItemResDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: ListingApplicationStatus })
  status: ListingApplicationStatus;
  @ApiProperty({ type: String, nullable: true }) serviceName: string | null;
  @ApiProperty() currentStep: number;
  @ApiProperty() lastSavedAt: Date;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ description: '만료 7일 전부터 true. 안내 배너에 사용' })
  expiresSoon: boolean;
}

export class ListingDraftResDto extends ListingDraftItemResDto {
  @ApiProperty({ type: ListingDraftDataReqDto }) data: ListingDraftDataReqDto;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '임시저장은 접수번호를 발급하지 않음',
  })
  applicationNumber: string | null;
}

export class GetListingDraftsResDto {
  @ApiProperty({ type: [ListingDraftItemResDto] })
  items: ListingDraftItemResDto[];
  @ApiProperty({ description: 'limit와 관계없는 유효 임시저장 전체 건수' })
  totalCount: number;
  @ApiProperty() maxCount: number;
  @ApiProperty() canCreate: boolean;
}
