import { ApiProperty } from '@nestjs/swagger';
import {
  InquiryStatus,
  InquiryType,
} from '../../../../generated/prisma/client.js';

export class InquiryResDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'INQ-20261028-A1B2C3D4E5F6' }) inquiryCode: string;
  @ApiProperty({ enum: InquiryType }) inquiryType: InquiryType;
  @ApiProperty() title: string;
  @ApiProperty() content: string;
  @ApiProperty({ enum: InquiryStatus }) status: InquiryStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createDate: Date;
  @ApiProperty({ type: String, format: 'date-time' }) modifiedDate: Date;
}

export class GetInquiriesResDto {
  @ApiProperty({ type: [InquiryResDto] }) items: InquiryResDto[];
  @ApiProperty() page: number;
  @ApiProperty() size: number;
  @ApiProperty() totalCount: number;
}
