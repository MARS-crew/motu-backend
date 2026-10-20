import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PointResetCondition {
  /** 주문에 예약된 포인트가 0P */
  NO_LOCKED_CASH = 'NO_LOCKED_CASH',
  /** 보유 포인트가 초기 포인트의 10% 미만 */
  CASH_BELOW_LIMIT = 'CASH_BELOW_LIMIT',
  /** 마지막 리셋 후 7일 경과 (리셋한 적이 없으면 충족) */
  RESET_INTERVAL_PASSED = 'RESET_INTERVAL_PASSED',
}

export class PointResetConditionResDto {
  @ApiProperty({
    enum: PointResetCondition,
    example: PointResetCondition.CASH_BELOW_LIMIT,
  })
  condition: PointResetCondition;

  @ApiProperty({ description: '충족 여부', example: false })
  met: boolean;

  @ApiProperty({
    description: '조건 설명. 충족하지 못했을 때 리셋 불가 사유로 표시한다.',
    example: '보유 포인트가 300,000P 이상이라 리셋할 수 없습니다.',
  })
  message: string;
}

export class GetPointResetResDto {
  @ApiProperty({ description: '리셋 후 보유 포인트', example: 3_000_000 })
  resetCash: number;

  @ApiProperty({ description: '현재 보유 포인트', example: 200_000 })
  cash: number;

  @ApiProperty({ description: '지금 리셋할 수 있는지', example: true })
  available: boolean;

  @ApiProperty({ type: [PointResetConditionResDto] })
  conditions: PointResetConditionResDto[];

  @ApiPropertyOptional({
    description:
      '7일 제한이 풀리는 시각. 리셋한 적이 없거나 이미 지났으면 null',
    example: null,
    nullable: true,
  })
  nextAvailableAt: Date | null;
}
