import { ApiProperty } from '@nestjs/swagger';

export class SendContactPhoneVerificationResDto {
  @ApiProperty({
    description: '인증번호를 보낸 휴대폰 (가운데 가림)',
    example: '010-****-8901',
  })
  maskedPhoneNumber: string;

  @ApiProperty({ description: '인증번호 만료 시각 (발송 후 5분)' })
  expiresAt: Date;

  @ApiProperty({ description: '재발송 가능 시각 (발송 후 30초)' })
  resendAvailableAt: Date;
}
