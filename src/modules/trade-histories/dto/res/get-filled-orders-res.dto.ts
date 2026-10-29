import { ApiProperty } from '@nestjs/swagger';
import { OrderSide, OrderStatus } from '../../../../generated/prisma/client.js';
import { TradeHistoryPageResDto } from './trade-history-page-res.dto.js';

export class FilledOrderItemResDto {
  @ApiProperty({ description: '주문 ID', example: 30 })
  orderId: number;

  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '상품명', example: 'CloudWorks' })
  stockName: string;

  @ApiProperty({ description: '매수 / 매도', enum: OrderSide })
  side: OrderSide;

  @ApiProperty({ description: '주문 가격 (P)', example: 9_300 })
  orderPrice: number;

  @ApiProperty({ description: '주문 수량', example: 50 })
  orderQty: number;

  @ApiProperty({ description: '조회 기간 안에 체결된 수량', example: 10 })
  filledQty: number;

  @ApiProperty({
    description:
      '조회 기간 안에 체결된 금액 (P, 체결가 × 수량 합계, 수수료 제외)',
    example: 93_000,
  })
  filledAmount: number;

  @ApiProperty({ description: '체결 수수료 합계 (P)', example: 18 })
  fee: number;

  @ApiProperty({
    description:
      '주문 상태 (PARTIAL 일부 체결, FILLED 전부 체결, CANCELED 남은 수량 취소)',
    enum: OrderStatus,
  })
  status: OrderStatus;

  @ApiProperty({
    description: '체결일시 (조회 기간 안의 마지막 체결 시각)',
    example: '2026-10-28T05:32:00.000Z',
  })
  filledAt: Date;
}

export class GetFilledOrdersResDto extends TradeHistoryPageResDto {
  @ApiProperty({ type: [FilledOrderItemResDto] })
  items: FilledOrderItemResDto[];
}
