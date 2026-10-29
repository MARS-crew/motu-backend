import { ApiProperty } from '@nestjs/swagger';
import { OrderSide, OrderStatus } from '../../../../generated/prisma/client.js';
import { TradeHistoryPageResDto } from './trade-history-page-res.dto.js';

export class OpenOrderItemResDto {
  @ApiProperty({
    description: '주문 ID. 취소는 POST /orders/{orderId}/cancel',
    example: 31,
  })
  orderId: number;

  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '상품명', example: 'CloudWorks' })
  stockName: string;

  @ApiProperty({ description: '매수 / 매도', enum: OrderSide })
  side: OrderSide;

  @ApiProperty({ description: '주문 가격 (P)', example: 9_300 })
  price: number;

  @ApiProperty({ description: '최초 주문 수량', example: 50 })
  qty: number;

  @ApiProperty({ description: '체결된 수량', example: 20 })
  filledQty: number;

  @ApiProperty({
    description: '미체결 수량 (취소할 수 있는 수량)',
    example: 30,
  })
  remainingQty: number;

  @ApiProperty({
    description: '주문 금액 (P, 주문 가격 × 최초 주문 수량)',
    example: 465_000,
  })
  orderAmount: number;

  @ApiProperty({
    description: 'ACCEPTED 접수 / PARTIAL 일부 체결',
    enum: OrderStatus,
  })
  status: OrderStatus;

  @ApiProperty({
    description: '주문 시각',
    example: '2026-10-28T05:32:00.000Z',
  })
  orderedAt: Date;
}

export class GetOpenOrdersResDto extends TradeHistoryPageResDto {
  @ApiProperty({
    type: [OpenOrderItemResDto],
    description: '취소할 수 있는 주문만 (접수, 일부 체결)',
  })
  items: OpenOrderItemResDto[];
}
