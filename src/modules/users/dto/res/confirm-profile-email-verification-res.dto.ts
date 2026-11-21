import { ApiProperty } from '@nestjs/swagger';

export class ConfirmProfileEmailVerificationResDto {
  @ApiProperty({ description: '인증 완료 여부', example: true })
  verified: boolean;

  @ApiProperty({
    description:
      '이 시각까지 회원정보 수정(PATCH /api/users/me)을 한 번 할 수 있다. 지나면 다시 인증한다.',
    example: '2026-11-21T03:30:00.000Z',
  })
  editableUntil: Date;
}
