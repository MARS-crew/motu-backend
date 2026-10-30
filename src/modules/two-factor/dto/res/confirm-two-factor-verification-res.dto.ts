import { ApiProperty } from '@nestjs/swagger';

export class ConfirmTwoFactorVerificationResDto {
  @ApiProperty({ description: '재인증이 유효한 시각까지 (인증 후 10분)' })
  verifiedUntil: Date;
}
