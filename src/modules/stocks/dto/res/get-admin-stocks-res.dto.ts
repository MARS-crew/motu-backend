import { ApiProperty } from '@nestjs/swagger';
import { TradeStatus } from '../../../../generated/prisma/client.js';

export class AdminStockItemResDto {
  @ApiProperty({
    description: '상품 ID. 화면에는 PRD-018처럼 표시',
    example: 18,
  })
  stockId: number;

  @ApiProperty({ example: 'MOTU0018' })
  stockCode: string;

  @ApiProperty({ example: 'SaaS Index' })
  name: string;

  @ApiProperty({ example: 1 })
  sectorCode: number;

  @ApiProperty({ example: 'SaaS/소프트웨어' })
  sectorName: string;

  @ApiProperty({ description: '상품 상태', enum: TradeStatus })
  tradeStatus: TradeStatus;

  @ApiProperty({ description: '노출 상태 (true 공개, false 비공개)' })
  isPublic: boolean;

  @ApiProperty({
    description: '거래 시작일시',
    example: '2026-09-01T00:00:00.000Z',
  })
  listingDate: Date;

  @ApiProperty({
    description: '현재가 (P). 거래 대기 상품은 null (화면에는 -)',
    example: 12_480,
    nullable: true,
    type: Number,
  })
  currentPrice: number | null;
}

export class GetAdminStocksResDto {
  @ApiProperty({ type: [AdminStockItemResDto], description: '최근 등록순' })
  items: AdminStockItemResDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 4 })
  totalCount: number;
}
