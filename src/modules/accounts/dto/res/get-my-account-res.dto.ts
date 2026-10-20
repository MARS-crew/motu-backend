import { ApiProperty } from '@nestjs/swagger';

export class GetMyAccountResDto {
  @ApiProperty({
    description: '보유 포인트 (주문에 예약된 포인트 포함)',
    example: 2_345_678,
  })
  cash: number;

  @ApiProperty({ description: '매수 주문에 예약된 포인트', example: 0 })
  lockedCash: number;

  @ApiProperty({
    description: '사용 가능 포인트 (보유 포인트 - 예약 포인트)',
    example: 2_345_678,
  })
  availableCash: number;
}
