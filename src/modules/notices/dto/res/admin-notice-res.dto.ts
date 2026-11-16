import { ApiProperty } from '@nestjs/swagger';
import { NoticeType } from '../../../../generated/prisma/client.js';

export enum AdminNoticeStatus {
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  ENDED = 'ENDED',
}

export class AdminNoticeItemResDto {
  @ApiProperty() noticeId: number;
  @ApiProperty({ enum: NoticeType }) type: NoticeType;
  @ApiProperty() title: string;
  @ApiProperty() isImportant: boolean;
  @ApiProperty() postStartDate: Date;
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
