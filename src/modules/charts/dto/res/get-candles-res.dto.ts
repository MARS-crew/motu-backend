import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChartInterval } from '../../../../generated/prisma/client.js';

export class CandleResDto {
  @ApiProperty({
    description: '봉 시작 시각',
    example: '2026-10-23T15:00:00.000Z',
  })
  time: Date;

  @ApiProperty({ description: '시가 (P)', example: 4_250 })
  openPrice: number;

  @ApiProperty({ description: '고가 (P)', example: 4_400 })
  highPrice: number;

  @ApiProperty({ description: '저가 (P)', example: 4_250 })
  lowPrice: number;

  @ApiProperty({ description: '종가 (P)', example: 4_400 })
  closePrice: number;

  @ApiProperty({ description: '거래량 (주)', example: 6 })
  volume: number;

  @ApiProperty({ description: '거래대금 (P)', example: 26_050 })
  tradeAmount: number;
}

export class GetCandlesResDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '봉 단위', enum: ChartInterval })
  interval: ChartInterval;

  @ApiProperty({
    type: [CandleResDto],
    description: '봉 목록 (오래된 순). 체결이 없던 구간의 봉은 없다.',
  })
  items: CandleResDto[];

  @ApiPropertyOptional({
    description: '더 이전 봉을 읽을 커서. 더 이전 봉이 없으면 null',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;
}
