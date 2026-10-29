import { ApiProperty } from '@nestjs/swagger';

export class PriceAlertResDto {
  @ApiProperty({ description: '알림 ID', example: 12 })
  alertId: number;

  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '상품명', example: 'PLI' })
  stockName: string;

  @ApiProperty({ description: '설정 가격 (P)', example: 7_000 })
  targetPrice: number;

  @ApiProperty({
    description: '현재가 (P). 마지막 체결가이고, 체결된 적이 없으면 기준가',
    example: 6_750,
  })
  currentPrice: number;

  @ApiProperty({
    description:
      '켜져 있으면 true. 설정 가격에 도달해 알림이 울렸거나 거래가 종료된 상품이면 false',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: '알림이 울린 시각. 울리지 않았거나 수정한 뒤면 null',
    nullable: true,
    example: null,
  })
  triggeredDate: Date | null;

  @ApiProperty({ description: '등록 시각' })
  createDate: Date;
}
