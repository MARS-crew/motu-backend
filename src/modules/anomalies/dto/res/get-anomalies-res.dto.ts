import { ApiProperty } from '@nestjs/swagger';
import {
  AnomalyStatus,
  AnomalyType,
} from '../../../../generated/prisma/client.js';

export class AnomalyItemResDto {
  @ApiProperty({ example: 7 })
  anomalyId: number;

  @ApiProperty({ description: '탐지 유형', enum: AnomalyType })
  type: AnomalyType;

  @ApiProperty({ description: '처리 상태', enum: AnomalyStatus })
  status: AnomalyStatus;

  @ApiProperty({
    description: '발생일시',
    example: '2026-09-03T10:42:00.000Z',
  })
  detectedDate: Date;

  @ApiProperty({
    description:
      '상품 ID. 화면에는 PRD- 접두어를 붙인다. 상품과 관계없으면 null',
    example: 18,
    nullable: true,
    type: Number,
  })
  stockId: number | null;

  @ApiProperty({
    description: '상품명',
    example: 'SaaS Index',
    nullable: true,
    type: String,
  })
  stockName: string | null;

  @ApiProperty({
    description: '회원 user_id. 화면에는 USR- 접두어를 붙인다.',
    example: 1024,
  })
  userId: number;

  @ApiProperty({ description: '회원 아이디', example: 'minhyuk01' })
  loginId: string;

  @ApiProperty({ description: '오류 코드', example: 'PRICE_DEVIATION' })
  errorCode: string;

  @ApiProperty({ description: '오류 내용', example: '가격 편차 초과' })
  errorMessage: string;
}

export class AnomalySummaryResDto {
  @ApiProperty({ description: '현재 조회 조건의 전체 건수', example: 7 })
  totalCount: number;

  @ApiProperty({ description: '그중 미처리 건수', example: 3 })
  pendingCount: number;

  @ApiProperty({
    description: '탐지 유형별 건수. 없는 유형은 0',
    example: {
      LARGE_ORDER: 1,
      REPEATED_ORDER: 2,
      ABNORMAL_PRICE: 1,
      ORDER_FAILURE: 2,
      BALANCE_MISMATCH: 1,
    },
  })
  typeCounts: Record<AnomalyType, number>;
}

export class GetAnomaliesResDto {
  @ApiProperty({ type: [AnomalyItemResDto], description: '최신 발생순' })
  items: AnomalyItemResDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 7 })
  totalCount: number;

  @ApiProperty({
    type: AnomalySummaryResDto,
    description: '상단 건수 (현재 조회 조건 기준)',
  })
  summary: AnomalySummaryResDto;
}
