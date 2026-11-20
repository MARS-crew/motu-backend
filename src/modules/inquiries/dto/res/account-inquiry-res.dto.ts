import { ApiProperty } from '@nestjs/swagger';
import { InquiryStatus } from '../../../../generated/prisma/client.js';

export class AccountInquiryResDto {
  @ApiProperty({ example: 'INQ-20261118-A1B2C3D4E5F6' }) inquiryCode: string;
  @ApiProperty({ enum: [InquiryStatus.SUBMITTED] }) status: InquiryStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createDate: Date;
  @ApiProperty({
    example: '문의가 접수되었습니다. 입력하신 이메일로 답변드리겠습니다.',
  })
  message: string;
}
