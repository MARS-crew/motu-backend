import { ApiProperty } from '@nestjs/swagger';
import { CashLedgerType } from '../../../../generated/prisma/client.js';

export class LedgerItemResDto {
  @ApiProperty({ example: 12 })
  ledgerId: number;

  @ApiProperty({
    description:
      '유형 (DEPOSIT 초기 지급, GRANT 추가 지급, RESET 리셋, ADJUST 관리자 조정, BUY 매수, SELL 매도)',
    enum: CashLedgerType,
    example: CashLedgerType.GRANT,
  })
  type: CashLedgerType;

  @ApiProperty({ description: '증감 포인트 (+ 또는 -)', example: 100_000 })
  amount: number;

  @ApiProperty({ description: '반영 전 보유 포인트', example: 2_345_678 })
  balanceBefore: number;

  @ApiProperty({ description: '반영 후 보유 포인트', example: 2_445_678 })
  balanceAfter: number;

  @ApiProperty({ example: '2026-10-20T10:19:00.000Z' })
  createDate: Date;
}

export class GetLedgersResDto {
  @ApiProperty({ type: [LedgerItemResDto], description: '최신순' })
  items: LedgerItemResDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 3 })
  totalCount: number;
}
