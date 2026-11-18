import { ApiProperty } from '@nestjs/swagger';
import { NoticeType } from '../../../../generated/prisma/client.js';

export enum AdminNoticeStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  ENDED = 'ENDED',
  HIDDEN = 'HIDDEN',
  DELETED = 'DELETED',
}

export class AdminNoticeItemResDto {
  @ApiProperty() noticeId: number;
  @ApiProperty({ enum: NoticeType }) type: NoticeType;
  @ApiProperty({ type: Number, nullable: true }) stockId: number | null;
  @ApiProperty({ type: String, nullable: true }) stockCode: string | null;
  @ApiProperty({ type: String, nullable: true }) stockName: string | null;
  @ApiProperty() title: string;
  @ApiProperty() isImportant: boolean;
  @ApiProperty({ type: Date, nullable: true }) postStartDate: Date | null;
  @ApiProperty({ type: Date, nullable: true }) postEndDate: Date | null;
  @ApiProperty({ enum: AdminNoticeStatus }) status: AdminNoticeStatus;
  @ApiProperty() createDate: Date;
  @ApiProperty() modifiedDate: Date;
}

export class AdminNoticeResDto extends AdminNoticeItemResDto {
  @ApiProperty() content: string;
}

export class GetAdminNoticesResDto {
  @ApiProperty({ type: [AdminNoticeItemResDto] })
  items: AdminNoticeItemResDto[];
  @ApiProperty() page: number;
  @ApiProperty() size: number;
  @ApiProperty() totalCount: number;
}
