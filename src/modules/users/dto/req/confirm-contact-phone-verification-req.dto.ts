import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { SendContactPhoneVerificationReqDto } from './send-contact-phone-verification-req.dto.js';

export class ConfirmContactPhoneVerificationReqDto extends SendContactPhoneVerificationReqDto {
  @ApiProperty({ description: '인증번호 6자리', example: '135790' })
  @Matches(/^\d{6}$/, { message: '인증번호 6자리를 입력해 주세요.' })
  code: string;
}
