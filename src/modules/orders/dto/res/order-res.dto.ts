import { ApiProperty } from '@nestjs/swagger';
import {
  OrderSide,
  OrderStatus,
  OrderType,
} from '../../../../generated/prisma/client.js';

export class OrderResDto {
  @ApiProperty({ description: '주문 ID', example: 100 })
  orderId: number;

  @ApiProperty({
    description: '중복 요청 방지 키',
    example: '3f2a9c1e-8b7d-4c5e-9f10-2a3b4c5d6e7f',
  })
  clientOrderId: string;

  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '주문 방향', enum: OrderSide })
  side: OrderSide;

  @ApiProperty({ description: '주문 종류', enum: OrderType })
  orderType: OrderType;

  @ApiProperty({ description: '주문 가격 (P)', example: 5_000 })
  price: number;

  @ApiProperty({ description: '주문 수량', example: 10 })
  qty: number;

  @ApiProperty({ description: '체결 수량', example: 0 })
  filledQty: number;

  @ApiProperty({
    description: '미체결 수량 (취소된 주문은 0)',
    example: 10,
  })
  remainingQty: number;

  @ApiProperty({
    description: '주문 금액 (P, 주문 가격 × 주문 수량, 수수료 제외)',
    example: 67_000,
  })
  orderAmount: number;

  @ApiProperty({
    description: '매수 주문에 남아 있는 예약 포인트 (매도는 0)',
    example: 50_000,
  })
  lockedAmount: number;

  @ApiProperty({
    description:
      '주문 상태 (ACCEPTED 접수, PARTIAL 일부 체결, FILLED 전부 체결, CANCELED 취소)',
    enum: OrderStatus,
  })
  status: OrderStatus;

  @ApiProperty({
    description: '주문 시각',
    example: '2026-10-24T01:00:00.000Z',
  })
  createDate: Date;

  @ApiProperty({
    description: '취소 시각 (취소 전이면 null)',
    example: null,
    nullable: true,
  })
  canceledDate: Date | null;
}
