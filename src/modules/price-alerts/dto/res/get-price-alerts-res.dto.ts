import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceAlertResDto } from './price-alert-res.dto.js';

export class GetPriceAlertsResDto {
  @ApiProperty({ type: [PriceAlertResDto], description: '최근 등록순' })
  items: PriceAlertResDto[];

  @ApiPropertyOptional({
    description: '다음 페이지 커서. 마지막 페이지면 null',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;
}
