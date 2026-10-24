import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttachmentKind,
  AttachmentPurpose,
} from '../../../../generated/prisma/client.js';
export class AttachmentResDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AttachmentKind }) kind: AttachmentKind;
  @ApiPropertyOptional({ nullable: true }) originalName: string | null;
  @ApiPropertyOptional({ nullable: true }) contentType: string | null;
  @ApiPropertyOptional({ nullable: true }) size: number | null;
  @ApiPropertyOptional({ nullable: true, description: '외부 링크 주소' }) url:
    string | null;
  @ApiProperty() saved: boolean;
  @ApiProperty({
    description: '파일 조회 API 경로. FILE인 경우만 제공',
    nullable: true,
  })
  downloadPath: string | null;
}
export class CollectionResDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: AttachmentPurpose }) purpose: AttachmentPurpose;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ type: [AttachmentResDto] }) attachments: AttachmentResDto[];
}
