import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { AttachmentPurpose } from '../../../../generated/prisma/client.js';
export class CreateCollectionReqDto {
  @ApiProperty({ enum: AttachmentPurpose, example: 'EVIDENCE' })
  @IsEnum(AttachmentPurpose, { message: INVALID_REQUEST_MESSAGE })
  purpose: AttachmentPurpose;
}
