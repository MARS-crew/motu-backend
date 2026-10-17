import { ApiProperty } from '@nestjs/swagger';

export class VerifyPasswordResetResDto {
  @ApiProperty({ description: '링크 사용 가능 여부', example: true })
  valid: boolean;
}
