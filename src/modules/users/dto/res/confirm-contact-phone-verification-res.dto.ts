import { ApiProperty } from '@nestjs/swagger';

export class ConfirmContactPhoneVerificationResDto {
  @ApiProperty({ description: '연락처 인증 완료 여부', example: true })
  verified: boolean;
}
