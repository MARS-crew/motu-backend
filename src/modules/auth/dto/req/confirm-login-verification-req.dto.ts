import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { SendLoginVerificationReqDto } from './send-login-verification-req.dto.js';

export class ConfirmLoginVerificationReqDto extends SendLoginVerificationReqDto {
  @ApiProperty({ description: '인증번호 6자리', example: '123456' })
  @Matches(/^\d{6}$/, { message: '인증번호 6자리를 입력해 주세요.' })
  code: string;
}
