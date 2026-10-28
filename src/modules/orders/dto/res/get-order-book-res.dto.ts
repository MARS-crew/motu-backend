import { ApiProperty } from '@nestjs/swagger';

export class OrderBookLevelResDto {
  @ApiProperty({ description: '호가 (P)', example: 5_000 })
  price: number;

  @ApiProperty({
    description: '이 가격에 걸린 미체결 수량 합계',
    example: 7,
  })
  qty: number;
}

export class GetOrderBookResDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({
    type: [OrderBookLevelResDto],
    description:
      '매도 호가. 낮은 가격부터 최대 5개. 화면에서 위에 높은 가격부터 그리려면 뒤집어서 쓴다.',
  })
  asks: OrderBookLevelResDto[];

  @ApiProperty({
    type: [OrderBookLevelResDto],
    description: '매수 호가. 높은 가격부터 최대 5개',
  })
  bids: OrderBookLevelResDto[];
}
