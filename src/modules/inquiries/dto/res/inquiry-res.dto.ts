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

export class InquiryAccessTokenResDto {
  @ApiProperty({
    description: '문의 전용 토큰. 일반 로그인 토큰과 별도로 보관한다.',
  })
  inquiryAccessToken: string;
  @ApiProperty({ example: 900 }) expiresIn: number;
}
