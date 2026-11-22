import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendLoginIdVerificationResDto {
  @ApiProperty({ description: '인증번호 만료 시각' })
  expiresAt: Date;

  @ApiProperty({ description: '재발송 가능 시각' })
  resendAvailableAt: Date;

  @ApiPropertyOptional({
    description:
      '테스트 배포에서 VERIFICATION_CODE_EXPOSURE를 켰을 때만 내려주는 인증번호. 운영에서는 없다.',
    example: '123456',
  })
  devCode?: string;
}
