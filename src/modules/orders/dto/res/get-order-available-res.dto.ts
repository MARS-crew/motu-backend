import { ApiProperty } from '@nestjs/swagger';
import { TradeStatus } from '../../../../generated/prisma/client.js';

export class GetOrderAvailableResDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({
    description: '거래 상태. ACTIVE가 아니면 주문할 수 없다.',
    enum: TradeStatus,
  })
  tradeStatus: TradeStatus;

  @ApiProperty({
    description: '호가 단위. 주문 가격은 이 값의 배수여야 한다.',
    example: 10,
  })
  priceTickSize: number;

  @ApiProperty({ description: '최소 주문 가격 (P)', example: 10 })
  minOrderPrice: number;

  @ApiProperty({ description: '최소 주문 수량', example: 1 })
  minOrderQty: number;

  @ApiProperty({
    description:
      '수수료율 (0.0015 = 0.15%). 수수료는 체결 금액 × 수수료율, 원 단위 미만 버림',
    example: 0,
  })
  feeRate: number;

  @ApiProperty({
    description: '사용 가능 포인트 (보유 포인트 - 예약 포인트)',
    example: 3_000_000,
  })
  availableCash: number;

  @ApiProperty({
    description: '매도 가능 수량 (보유 수량 - 예약 수량, 보유하지 않으면 0)',
    example: 0,
  })
  sellableQty: number;
}
