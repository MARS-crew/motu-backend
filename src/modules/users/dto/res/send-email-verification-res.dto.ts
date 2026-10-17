import { ApiProperty } from '@nestjs/swagger';

export class SendEmailVerificationResDto {
  @ApiProperty({ description: '인증번호 만료 시각' })
  expiresAt: Date;

  @ApiProperty({ description: '재발송 가능 시각' })
  resendAvailableAt: Date;
}
