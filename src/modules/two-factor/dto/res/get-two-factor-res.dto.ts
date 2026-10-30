import { ApiProperty } from '@nestjs/swagger';
import { TwoFactorStatus } from '../../../../generated/prisma/client.js';

export class GetTwoFactorResDto {
  @ApiProperty({
    enum: TwoFactorStatus,
    description: 'NOT_SET 미설정 / ENABLED 설정 완료 / DISABLED 해제',
  })
  status: TwoFactorStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '등록 휴대폰 (가운데 가림). 설정 완료일 때만 값이 있다.',
    example: '010-****-4821',
  })
  maskedPhoneNumber: string | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: '설정(휴대폰 변경) 일시',
  })
  enabledDate: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: '최근 SMS 인증 일시',
  })
  lastVerifiedDate: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: '재인증이 유효한 시각까지. 지났거나 인증한 적이 없으면 null',
  })
  verifiedUntil: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      '5회 연속 실패로 SMS 인증이 제한되는 시각까지. 제한 중이 아니면 null',
  })
  lockedUntil: Date | null;

  @ApiProperty({
    description:
      'SMS 인증번호 남은 입력 가능 횟수 (연속 5회 실패 시 30분 제한)',
    example: 5,
  })
  remainingAttempts: number;
}
