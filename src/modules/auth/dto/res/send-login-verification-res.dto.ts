import { ApiProperty } from '@nestjs/swagger';
import { LoginVerificationMethod } from '../../../two-factor/two-factor.constants.js';

export class SendLoginVerificationResDto {
  @ApiProperty({ enum: LoginVerificationMethod })
  method: LoginVerificationMethod;

  @ApiProperty({
    description: '인증번호를 보낸 곳 (가림)',
    example: '010-****-4821',
  })
  maskedTarget: string;

  @ApiProperty({ description: '인증번호 만료 시각' })
  expiresAt: Date;

  @ApiProperty({ description: '재발송 가능 시각' })
  resendAvailableAt: Date;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'SMS일 때 남은 입력 가능 횟수 (연속 5회 실패 시 30분 제한). EMAIL은 null (인증번호당 5회)',
    example: 5,
  })
  remainingAttempts: number | null;
}
