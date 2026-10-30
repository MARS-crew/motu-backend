import { ApiProperty } from '@nestjs/swagger';
import { TradeStatus } from '../../../../generated/prisma/client.js';

export class PortfolioHoldingResDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  stockId: number;

  @ApiProperty({ description: '종목 코드', example: 'MOTU0001' })
  stockCode: string;

  @ApiProperty({ description: '상품명', example: 'CloudWorks' })
  name: string;

  @ApiProperty({
    description: '로고 (null이면 기본 이미지)',
    example: null,
    nullable: true,
  })
  logoImageUrl: string | null;

  @ApiProperty({ description: '거래 상태', enum: TradeStatus })
  tradeStatus: TradeStatus;

  @ApiProperty({
    description: '보유 수량 (매도 주문에 묶인 수량 포함)',
    example: 10,
  })
  qty: number;

  @ApiProperty({ description: '매도 가능 수량', example: 10 })
  sellableQty: number;

  @ApiProperty({
    description:
      '평균 매입 단가 (P, 매수 수수료 포함, 소수점 둘째 자리까지 반올림)',
    example: 4_350.87,
  })
  avgPrice: number;

  @ApiProperty({ description: '현재가 (P)', example: 4_500 })
  currentPrice: number;

  @ApiProperty({
    description: '전일 대비 변동 금액 (P). 상품 목록과 같은 값',
    example: 150,
  })
  changeAmount: number;

  @ApiProperty({
    description: '당일 등락률 (%). 상품 목록과 같은 값',
    example: 3.45,
  })
  changeRate: number;

  @ApiProperty({ description: '당일 거래량 (주)', example: 1_200 })
  volume: number;

  @ApiProperty({ description: '당일 거래대금 (P)', example: 5_400_000 })
  tradeAmount: number;

  @ApiProperty({ description: '상장일', example: '2026-10-15T00:00:00.000Z' })
  listingDate: Date;

  @ApiProperty({
    description: '매입 금액 (P, 매수 수수료 포함)',
    example: 43_508,
  })
  purchaseAmount: number;

  @ApiProperty({
    description: '평가금액 (P, 현재가 × 보유 수량)',
    example: 45_000,
  })
  evaluationAmount: number;

  @ApiProperty({
    description: '평가손익 (P, 평가금액 - 매입 금액)',
    example: 1_492,
  })
  profitLoss: number;

  @ApiProperty({
    description: '수익률 (%, 평가손익 ÷ 매입 금액, 소수점 둘째 자리까지)',
    example: 3.43,
  })
  profitRate: number;

  @ApiProperty({
    description: '총 자산에서 차지하는 비율 (%, 도넛 차트)',
    example: 1.48,
  })
  assetRatio: number;
}

export class GetPortfolioResDto {
  @ApiProperty({
    description: '총 자산 (P, 예수금 + 평가금액)',
    example: 3_045_000,
  })
  totalAsset: number;

  @ApiProperty({
    description: '예수금 (P, 매수 주문에 예약된 포인트 포함)',
    example: 3_000_000,
  })
  cash: number;

  @ApiProperty({ description: '매수 주문에 예약된 포인트', example: 0 })
  lockedCash: number;

  @ApiProperty({
    description: '사용 가능 예수금 (P, 예수금 - 예약 포인트)',
    example: 3_000_000,
  })
  availableCash: number;

  @ApiProperty({ description: '보유 상품 평가금액 합계 (P)', example: 45_000 })
  evaluationAmount: number;

  @ApiProperty({ description: '보유 상품 매입 금액 합계 (P)', example: 43_508 })
  purchaseAmount: number;

  @ApiProperty({ description: '평가손익 합계 (P)', example: 1_492 })
  profitLoss: number;

  @ApiProperty({
    description: '총 수익률 (%, 평가손익 ÷ 매입 금액). 보유 상품이 없으면 0',
    example: 3.43,
  })
  profitRate: number;

  @ApiProperty({
    description: '총 자산에서 예수금이 차지하는 비율 (%, 도넛 차트)',
    example: 98.52,
  })
  cashRatio: number;

  @ApiProperty({
    type: [PortfolioHoldingResDto],
    description: '보유 종목. 평가금액이 큰 순서',
  })
  holdings: PortfolioHoldingResDto[];

  @ApiProperty({
    description: '시세 기준 시각 (이 시각의 현재가로 계산)',
    example: '2026-10-28T10:00:00.000Z',
  })
  baseTime: Date;
}
