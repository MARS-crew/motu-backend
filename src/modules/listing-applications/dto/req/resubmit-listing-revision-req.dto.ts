import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class ResubmitListingRevisionReqDto {
  @ApiProperty({
    description:
      '본인 EVIDENCE 용도 저장 완료 묶음 ID. 재제출 후에는 변경할 수 없다.',
  })
  @IsUUID('4', { message: INVALID_REQUEST_MESSAGE })
  evidenceCollectionId: string;
}
