import { ApiProperty } from '@nestjs/swagger';
import { StockItemResDto } from './get-stocks-res.dto.js';

export class GetRecentlyViewedResDto {
  @ApiProperty({
    type: [StockItemResDto],
    description: '최근 본 순서, 최대 3개',
  })
  items: StockItemResDto[];
}
