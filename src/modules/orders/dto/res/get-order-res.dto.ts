import { ApiProperty } from '@nestjs/swagger';
import { OrderItemResDto } from './get-orders-res.dto.js';

export class OrderTradeResDto {
  @ApiProperty({ description: '체결 ID', example: 21 })
  tradeId: number;

  @ApiProperty({ description: '체결가 (P)', example: 4_900 })
  price: number;

  @ApiProperty({ description: '체결 수량', example: 1 })
  qty: number;

  @ApiProperty({
    description: '체결 시각',
    example: '2026-10-24T01:05:00.000Z',
  })
  createDate: Date;
}

export class GetOrderResDto extends OrderItemResDto {
  @ApiProperty({
    type: [OrderTradeResDto],
    description: '이 주문의 체결 내역 (체결순)',
  })
  trades: OrderTradeResDto[];
}
