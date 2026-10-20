import { ApiProperty } from '@nestjs/swagger';

export class AdjustCashResDto {
  @ApiProperty({ description: '조정 포인트 (+ 또는 -)', example: 1_000_000 })
  amount: number;

  @ApiProperty({ description: '조정 전 보유 포인트', example: 2_345_678 })
  cashBefore: number;

  @ApiProperty({ description: '조정 후 보유 포인트', example: 3_345_678 })
  cashAfter: number;
}
