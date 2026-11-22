import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendTwoFactorVerificationResDto {
  @ApiProperty({
    description: '인증번호를 보낸 휴대폰 (가운데 가림)',
    example: '010-****-4821',
  })
  maskedPhoneNumber: string;

  @ApiProperty({ description: '인증번호 만료 시각' })
  expiresAt: Date;

  @ApiProperty({ description: '재발송 가능 시각' })
  resendAvailableAt: Date;

  @ApiProperty({
    description: '남은 입력 가능 횟수 (연속 5회 실패 시 30분 제한)',
    example: 5,
  })
  remainingAttempts: number;

  @ApiPropertyOptional({
    description:
      '테스트 배포에서 VERIFICATION_CODE_EXPOSURE를 켰을 때만 내려주는 인증번호. 운영에서는 없다.',
    example: '123456',
  })
  devCode?: string;
}
