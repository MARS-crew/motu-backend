import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeStatus } from '../../../../generated/prisma/client.js';

/** 상장 신청에서 입력한 주요 서비스 지표. 값이 없으면 null이며 화면에 "정보없음"으로 표시한다. */
export class StockMetricsResDto {
  @ApiPropertyOptional({
    description: '월간 활성 사용자 수',
    nullable: true,
    example: 100_000,
  })
  mau: number | null;

  @ApiPropertyOptional({
    description: '일간 활성 사용자 수',
    nullable: true,
    example: 20_000,
  })
  dau: number | null;

  @ApiPropertyOptional({
    description: '연간 매출 (원, 최근 완료 회계연도)',
    nullable: true,
    example: 1_200_000_000,
  })
  revenue: number | null;

  @ApiPropertyOptional({
    description: '거래액 (원, 최근 12개월 결제 완료액에서 취소·환불 제외)',
    nullable: true,
    example: null,
  })
  transactionVolume: number | null;

  @ApiPropertyOptional({
    description: '집계 시작일 (YYYY-MM-DD)',
    nullable: true,
    example: '2025-10-01',
  })
  startDate: string | null;

  @ApiPropertyOptional({
    description: '집계 종료일 (YYYY-MM-DD)',
    nullable: true,
    example: '2026-09-30',
  })
  endDate: string | null;
}

export class GetStockResDto {
  @ApiProperty({ example: 5 })
  stockId: number;

  @ApiProperty({ example: 'MOTU0005' })
  stockCode: string;

  @ApiProperty({ example: 'PLI' })
  name: string;

  @ApiProperty({ description: '한 줄 소개', example: 'AI 활용 여행 플랜 앱' })
  summary: string;

  @ApiPropertyOptional({
    description: '상품 소개 (상세 설명)',
    nullable: true,
    example: 'PLI는 AI를 활용해 맞춤형 여행 일정을 추천해주는 앱입니다.',
  })
  description: string | null;

  @ApiProperty({ example: 5 })
  sectorCode: number;

  @ApiProperty({ example: '콘텐츠 / 미디어' })
  sectorName: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  logoImageUrl: string | null;

  @ApiProperty({ example: 'https://placehold.co/600x400?text=PLI' })
  mainImageUrl: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://mars-pli.kro.kr',
  })
  officialUrl: string | null;

  @ApiProperty({ description: '운영사', example: '마스외전' })
  operatorName: string;

  @ApiProperty({ type: StockMetricsResDto })
  metrics: StockMetricsResDto;

  @ApiProperty({ example: '2026-08-28T00:00:00.000Z' })
  listingDate: Date;

  @ApiProperty({
    description:
      '거래 상태 (PENDING 거래 대기, ACTIVE 거래 가능, PAUSED 거래 중지, CLOSED 거래 종료)',
    enum: TradeStatus,
    example: TradeStatus.ACTIVE,
  })
  tradeStatus: TradeStatus;

  @ApiProperty({
    description: '현재가 (P). 체결이 없으면 기준가',
    example: 6_750,
  })
  currentPrice: number;

  @ApiProperty({ description: '전일 대비 변동 금액 (P)', example: 0 })
  changeAmount: number;

  @ApiProperty({ description: '등락률 (%)', example: 0 })
  changeRate: number;
}
