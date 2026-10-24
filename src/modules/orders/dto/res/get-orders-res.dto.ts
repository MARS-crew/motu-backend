import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderResDto } from './order-res.dto.js';

export class OrderItemResDto extends OrderResDto {
  @ApiProperty({ description: '상품명', example: 'CloudWorks' })
  stockName: string;

  @ApiProperty({
    description: '평균 체결가 (소수점 둘째 자리까지, 체결 전이면 null)',
    example: 4_966.67,
    nullable: true,
  })
  avgFilledPrice: number | null;
}

export class GetOrdersResDto {
  @ApiProperty({ type: [OrderItemResDto], description: '최근 주문순' })
  items: OrderItemResDto[];

  @ApiPropertyOptional({
    description: '다음 페이지 커서. 마지막 페이지면 null',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;
}
