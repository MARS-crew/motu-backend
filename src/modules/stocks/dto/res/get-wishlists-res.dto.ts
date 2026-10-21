import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockItemResDto } from './get-stocks-res.dto.js';

export class GetWishlistsResDto {
  @ApiProperty({
    type: [StockItemResDto],
    description: '최근에 추가한 순서. isWishlisted는 모두 true',
  })
  items: StockItemResDto[];

  @ApiPropertyOptional({
    description: '다음 페이지 커서. 마지막 페이지면 null',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;
}
