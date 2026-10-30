import { ApiProperty } from '@nestjs/swagger';
import { LoginVerificationMethod } from '../../../two-factor/two-factor.constants.js';

/** 신뢰하지 않은 기기에서 로그인한 경우. 토큰 대신 새 기기 확인용 로그인 토큰을 내려준다. */
export class LoginVerificationRequiredResDto {
  @ApiProperty({ description: '새 기기 확인이 필요하면 true', example: true })
  verificationRequired: true;

  @ApiProperty({
    description: '새 기기 확인 API에 보낼 토큰. 일반 API에는 쓸 수 없다.',
  })
  loginToken: string;

  @ApiProperty({ description: '로그인 토큰 유효시간 (초)', example: 600 })
  loginTokenExpiresIn: number;

  @ApiProperty({
    enum: LoginVerificationMethod,
    description:
      'EMAIL: 2차 보안 미설정 → 가입 이메일 / SMS: 2차 보안 설정 → 등록 휴대폰',
  })
  method: LoginVerificationMethod;

  @ApiProperty({
    description: '인증번호를 받을 곳 (가림)',
    example: 'ki*****@gmail.com',
  })
  maskedTarget: string;
}
