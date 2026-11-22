import { ApiProperty } from '@nestjs/swagger';
import { ListingApplicationStatus } from '../../../../generated/prisma/client.js';

export class ListingSubmissionResDto {
  @ApiProperty() applicationId: number;
  @ApiProperty({ example: 'LST-261122-001' }) applicationNumber: string;
  @ApiProperty({
    enum: ListingApplicationStatus,
    description: '최초 제출은 SUBMITTED. 재요청은 현재 처리 상태를 반환한다.',
  })
  status: ListingApplicationStatus;
  @ApiProperty({ type: String, format: 'date-time' }) submittedAt: Date;
  @ApiProperty({
    description: '이미 접수된 신청서의 기존 결과를 반환했는지 여부',
  })
  replayed: boolean;
}
