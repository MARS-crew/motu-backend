import { ApiProperty } from '@nestjs/swagger';
import { TradeStatus } from '../../../../generated/prisma/client.js';

export class ChangeTradeStatusResDto {
  @ApiProperty({ example: 18 })
  stockId: number;

  @ApiProperty({ description: '처리 전 상품 상태', enum: TradeStatus })
  statusBefore: TradeStatus;

  @ApiProperty({ description: '처리 후 상품 상태', enum: TradeStatus })
  statusAfter: TradeStatus;

  @ApiProperty({
    description: '취소한 미체결 주문 수 (재개는 0)',
    example: 24,
  })
  canceledOrderCount: number;
}
