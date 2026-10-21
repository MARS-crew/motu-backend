import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockItemResDto } from './get-stocks-res.dto.js';

export class NewListingItemResDto extends StockItemResDto {
  @ApiProperty({
    description: '한 줄 소개',
    example: '팀 협업을 위한 클라우드 문서 도구',
  })
  summary: string;

  @ApiProperty({
    description: '상장 후 7일 이내면 true (New 배지)',
    example: true,
  })
  isNew: boolean;
}

export class GetNewListingsResDto {
  @ApiProperty({ type: [NewListingItemResDto], description: '최근 상장순' })
  items: NewListingItemResDto[];

  @ApiPropertyOptional({
    description: '다음 페이지 커서. 마지막 페이지면 null',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;
}
