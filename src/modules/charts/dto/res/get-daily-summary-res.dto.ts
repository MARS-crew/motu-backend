import { ApiProperty } from '@nestjs/swagger';

export class GetDailySummaryResDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({
    description: '현재가 (P). 마지막 체결가이고, 체결된 적이 없으면 기준가',
    example: 4_380,
  })
  currentPrice: number;

  @ApiProperty({
    description:
      '전일 종가 (P). 오늘(한국 시간 00시) 이전 마지막 체결가이고, 없으면 기준가',
    example: 4_200,
  })
  prevClosePrice: number;

  @ApiProperty({
    description: '전일 대비 (P, 현재가 - 전일 종가)',
    example: 180,
  })
  changeAmount: number;

  @ApiProperty({
    description: '등락률 (%, 소수점 둘째 자리까지)',
    example: 4.29,
  })
  changeRate: number;

  @ApiProperty({
    description: '오늘 시가 (오늘 체결이 없으면 null)',
    example: 4_300,
    nullable: true,
  })
  openPrice: number | null;

  @ApiProperty({
    description: '오늘 고가 (오늘 체결이 없으면 null)',
    example: 4_400,
    nullable: true,
  })
  highPrice: number | null;

  @ApiProperty({
    description: '오늘 저가 (오늘 체결이 없으면 null)',
    example: 4_250,
    nullable: true,
  })
  lowPrice: number | null;

  @ApiProperty({ description: '오늘 거래량 (주)', example: 120 })
  volume: number;

  @ApiProperty({ description: '오늘 거래대금 (P)', example: 522_000 })
  tradeAmount: number;
}
