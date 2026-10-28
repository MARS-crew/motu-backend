import { ApiProperty } from '@nestjs/swagger';
import { ListingApplicationStatus } from '../../../../generated/prisma/client.js';
import { CollectionResDto } from '../../../files/dto/res/attachment-res.dto.js';
import { ListingDraftDataReqDto } from '../req/listing-draft-data-req.dto.js';
import { ListingDraftResDto } from './listing-draft-res.dto.js';

export class ListingApplicationStatusResDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: ListingApplicationStatus })
  status: ListingApplicationStatus;
  @ApiProperty() statusLabel: string;
  @ApiProperty({ type: String, nullable: true }) applicationNumber:
    string | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: '후속 제출 기능이 기록한 실제 접수일',
  })
  submittedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) reviewComment: string | null;
  @ApiProperty({ type: Date, nullable: true }) revisionDeadline: Date | null;
  @ApiProperty() isEditable: boolean;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: '임시저장/만료 상태에서만 제공',
  })
  expiresAt: Date | null;
}

export class ListingApplicationAttachmentsResDto {
  @ApiProperty({ type: CollectionResDto, nullable: true })
  logo: CollectionResDto | null;
  @ApiProperty({ type: CollectionResDto, nullable: true })
  mainImage: CollectionResDto | null;
  @ApiProperty({ type: CollectionResDto, nullable: true })
  evidence: CollectionResDto | null;
}

export class ListingApplicationResDto extends ListingApplicationStatusResDto {
  @ApiProperty({ type: ListingDraftDataReqDto }) data: ListingDraftDataReqDto;
  @ApiProperty({ type: ListingApplicationAttachmentsResDto })
  attachments: ListingApplicationAttachmentsResDto;
  @ApiProperty() currentStep: number;
  @ApiProperty() lastSavedAt: Date;
  @ApiProperty() createDate: Date;
  @ApiProperty() modifiedDate: Date;
}

export class SaveListingStepResDto extends ListingDraftResDto {
  @ApiProperty({
    minimum: 1,
    maximum: 4,
    description:
      '이번 요청에서 검증·저장한 단계. 이후 임시저장 변경 시 재검증 필요.',
  })
  validatedStep: number;
}
