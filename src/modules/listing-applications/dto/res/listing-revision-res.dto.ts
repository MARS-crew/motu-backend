import { ApiProperty } from '@nestjs/swagger';
import { ListingApplicationStatus } from '../../../../generated/prisma/client.js';
import { CollectionResDto } from '../../../files/dto/res/attachment-res.dto.js';

export class ListingRevisionResDto {
  @ApiProperty() id: number;
  @ApiProperty() requestContent: string;
  @ApiProperty() deadline: Date;
  @ApiProperty({
    description: '미재제출 상태에서 현재 시각이 기한 이상인지 여부',
  })
  isDeadlinePassed: boolean;
  @ApiProperty() canResubmit: boolean;
  @ApiProperty({ type: Date, nullable: true }) resubmittedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) evidenceCollectionId:
    string | null;
  @ApiProperty({
    type: CollectionResDto,
    nullable: true,
    description: '재제출 당시 저장 완료 증빙 스냅샷',
  })
  evidence: CollectionResDto | null;
  @ApiProperty() createDate: Date;
}

export class ListingRevisionResultResDto {
  @ApiProperty() applicationId: number;
  @ApiProperty({ type: String, nullable: true }) applicationNumber:
    string | null;
  @ApiProperty({ enum: ListingApplicationStatus })
  status: ListingApplicationStatus;
  @ApiProperty({ type: ListingRevisionResDto }) revision: ListingRevisionResDto;
}

export class GetListingRevisionsResDto {
  @ApiProperty() applicationId: number;
  @ApiProperty({ type: String, nullable: true }) applicationNumber:
    string | null;
  @ApiProperty({ enum: ListingApplicationStatus })
  status: ListingApplicationStatus;
  @ApiProperty({
    type: [ListingRevisionResDto],
    description: '최근 요청 ID 내림차순',
  })
  items: ListingRevisionResDto[];
  @ApiProperty() page: number;
  @ApiProperty() size: number;
  @ApiProperty() totalCount: number;
}
