import { ApiProperty } from '@nestjs/swagger';
import { AdminStockItemResDto } from './get-admin-stocks-res.dto.js';

export class AdminStockMetricsResDto {
  @ApiProperty({
    description: 'MAU (월간 활성 사용자 수). 없으면 null (화면에는 미등록)',
    example: 120_000,
    nullable: true,
    type: Number,
  })
  mau: number | null;

  @ApiProperty({
    description: '거래액. 없으면 null (화면에는 미등록)',
    example: 85_000_000,
    nullable: true,
    type: Number,
  })
  transactionVolume: number | null;

  @ApiProperty({
    description: '지표 기준일 (YYYY-MM-DD). 없으면 null',
    example: '2026-08-31',
    nullable: true,
    type: String,
  })
  baseDate: string | null;
}

export class GetAdminStockResDto extends AdminStockItemResDto {
  @ApiProperty({ description: '한 줄 소개', example: 'SaaS 기업 성장성 기반' })
  summary: string;

  @ApiProperty({
    description: '상품 소개',
    example: 'SaaS 기업 성장성 기반 모의투자 상품',
    nullable: true,
    type: String,
  })
  description: string | null;

  @ApiProperty({ example: '마스외전랩' })
  operatorName: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'https://saas.example.com',
  })
  officialUrl: string | null;

  @ApiProperty({ nullable: true, type: String })
  logoImageUrl: string | null;

  @ApiProperty({ description: '대표 이미지' })
  mainImageUrl: string;

  @ApiProperty({ description: '총 발행량 (주)', example: 100_000 })
  listedShares: number;

  @ApiProperty({ description: '미체결 주문 건수', example: 24 })
  openOrderCount: number;

  @ApiProperty({ type: AdminStockMetricsResDto, description: '서비스 지표 탭' })
  metrics: AdminStockMetricsResDto;
}
