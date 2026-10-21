import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeStatus } from '../../../../generated/prisma/client.js';

export class StockItemResDto {
  @ApiProperty({ example: 1 })
  stockId: number;

  @ApiProperty({ example: 'MOTU0001' })
  stockCode: string;

  @ApiProperty({ example: 'CloudWorks' })
  name: string;

  @ApiProperty({ example: 1 })
  sectorCode: number;

  @ApiProperty({ example: 'SaaS / 소프트웨어' })
  sectorName: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  logoImageUrl: string | null;

  @ApiProperty({
    description: '현재가 (P). 체결이 없으면 기준가',
    example: 4_350,
  })
  currentPrice: number;

  @ApiProperty({ description: '전일 대비 변동 금액 (P)', example: 0 })
  changeAmount: number;

  @ApiProperty({ description: '등락률 (%)', example: 0 })
  changeRate: number;

  @ApiProperty({ description: '당일 거래량 (주)', example: 0 })
  volume: number;

  @ApiProperty({ description: '당일 거래대금 (P)', example: 0 })
  tradeAmount: number;

  @ApiProperty({ example: '2026-10-15T00:00:00.000Z' })
  listingDate: Date;

  @ApiProperty({
    description:
      '거래 상태 (PENDING 거래 대기, ACTIVE 거래 가능, PAUSED 거래 중지, CLOSED 거래 종료)',
    enum: TradeStatus,
    example: TradeStatus.ACTIVE,
  })
  tradeStatus: TradeStatus;

  @ApiProperty({
    description: '관심상품 여부. 비회원이면 false',
    example: false,
  })
  isWishlisted: boolean;
}

export class GetStocksResDto {
  @ApiProperty({ type: [StockItemResDto] })
  items: StockItemResDto[];

  @ApiPropertyOptional({
    description: '다음 페이지 커서. 마지막 페이지면 null',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;
}
