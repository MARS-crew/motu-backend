import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailVerificationResDto {
  @ApiProperty({ description: '인증 완료 여부', example: true })
  verified: boolean;
}
