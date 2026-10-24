import { ApiProperty } from '@nestjs/swagger';
import { OrderSide } from '../../../../generated/prisma/client.js';

export class RecentTradeResDto {
  @ApiProperty({ description: '체결 ID', example: 104 })
  tradeId: number;

  @ApiProperty({ description: '체결가 (P)', example: 4_400 })
  price: number;

  @ApiProperty({ description: '체결 수량', example: 1 })
  qty: number;

  @ApiProperty({
    description:
      '체결을 일으킨 쪽. BUY 매수 체결(매도 호가를 사들임), SELL 매도 체결(매수 호가에 팔아넘김)',
    enum: OrderSide,
  })
  side: OrderSide;

  @ApiProperty({
    description: '체결 시각',
    example: '2026-10-24T09:31:41.000Z',
  })
  createDate: Date;
}

export class GetRecentTradesResDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({
    type: [RecentTradeResDto],
    description: '최근 체결 최대 5건 (최신순)',
  })
  items: RecentTradeResDto[];
}
