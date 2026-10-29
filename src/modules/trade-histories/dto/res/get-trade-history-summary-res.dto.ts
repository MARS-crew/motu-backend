import { ApiProperty } from '@nestjs/swagger';

export class GetTradeHistorySummaryResDto {
  @ApiProperty({
    description: '조회 시작일 (한국 날짜)',
    example: '2026-10-01',
  })
  from: string;

  @ApiProperty({
    description: '조회 종료일 (한국 날짜, 포함)',
    example: '2026-10-28',
  })
  to: string;

  @ApiProperty({
    description: '총 거래금액 (P, 매수 + 매도)',
    example: 1_250_340,
  })
  totalAmount: number;

  @ApiProperty({ description: '매수 거래금액 (P)', example: 650_000 })
  buyAmount: number;

  @ApiProperty({ description: '매도 거래금액 (P)', example: 600_340 })
  sellAmount: number;
}
