import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PointResetCondition } from '../../../../generated/prisma/client.js';

export class PointResetConditionResDto {
  @ApiProperty({
    description:
      'NO_HOLDINGS 보유 종목 없음, NO_LOCKED_CASH 미체결 주문 없음(예약 포인트 0P), CASH_BELOW_LIMIT 보유 포인트 300,000P 미만, RESET_INTERVAL_PASSED 마지막 리셋 후 7일 경과',
    enum: PointResetCondition,
    example: PointResetCondition.CASH_BELOW_LIMIT,
  })
  condition: PointResetCondition;

  @ApiProperty({ description: '충족 여부', example: false })
  met: boolean;
}

export class GetPointResetResDto {
  @ApiProperty({ description: '리셋 후 보유 포인트', example: 3_000_000 })
  resetCash: number;

  @ApiProperty({ description: '현재 보유 포인트', example: 200_000 })
  cash: number;

  @ApiProperty({ description: '지금 리셋할 수 있는지', example: false })
  available: boolean;

  @ApiPropertyOptional({
    description:
      '리셋 불가 사유. 충족하지 못한 조건 중 화면 순서상 첫 번째 사유이며, 리셋할 수 있으면 null',
    example: '보유 포인트가 리셋 가능 기준(300,000P) 이상입니다.',
    nullable: true,
  })
  reason: string | null;

  @ApiProperty({ type: [PointResetConditionResDto], description: '화면 순서' })
  conditions: PointResetConditionResDto[];

  @ApiPropertyOptional({
    description:
      '7일 제한이 풀리는 시각. 리셋한 적이 없거나 이미 지났으면 null',
    example: null,
    nullable: true,
  })
  nextAvailableAt: Date | null;

  @ApiProperty({
    description:
      '7일 제한이 풀릴 때까지 남은 시간(초). 서버 시각 기준이며 제한이 없으면 0',
    example: 0,
  })
  remainingSeconds: number;
}
