import { ApiProperty } from '@nestjs/swagger';
import { OrderSide } from '../../../../generated/prisma/client.js';
import { TradeHistoryPageResDto } from './trade-history-page-res.dto.js';

export class TradeHistoryItemResDto {
  @ApiProperty({ description: '체결 ID', example: 104 })
  tradeId: number;

  @ApiProperty({
    description: '거래일시 (체결 시각)',
    example: '2026-10-28T05:32:00.000Z',
  })
  tradedAt: Date;

  @ApiProperty({ description: '이 체결이 속한 내 주문 ID', example: 30 })
  orderId: number;

  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '상품명', example: 'CloudWorks' })
  stockName: string;

  @ApiProperty({ description: '매수 / 매도', enum: OrderSide })
  side: OrderSide;

  @ApiProperty({ description: '체결가 (P)', example: 9_300 })
  price: number;

  @ApiProperty({ description: '체결 수량', example: 10 })
  qty: number;

  @ApiProperty({
    description: '거래금액 (P, 체결가 × 체결 수량, 수수료 제외)',
    example: 93_000,
  })
  amount: number;

  @ApiProperty({ description: '거래 수수료 (P)', example: 18 })
  fee: number;
}

export class GetTradeHistoriesResDto extends TradeHistoryPageResDto {
  @ApiProperty({ type: [TradeHistoryItemResDto] })
  items: TradeHistoryItemResDto[];
}
