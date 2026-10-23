import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AttachmentPurpose } from '../../../../generated/prisma/client.js';
export class CreateCollectionReqDto {
  @ApiProperty({ enum: AttachmentPurpose, example: 'EVIDENCE' })
  @IsEnum(AttachmentPurpose)
  purpose: AttachmentPurpose;
}
