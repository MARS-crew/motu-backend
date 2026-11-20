import { ApiProperty } from '@nestjs/swagger';

/** 운영 대시보드 상단 카드. 전일 대비는 한국 시간 어제 마감 값과 비교한다. */
export class GetDashboardKpisResDto {
  @ApiProperty({
    description:
      '전체 회원 수. 일반 회원(잠김·정지 포함), 관리자·탈퇴 회원 제외',
    example: 12_480,
  })
  userCount: number;

  @ApiProperty({
    description:
      '전체 회원 전일 대비 증감률 (%, 소수점 둘째 자리까지). 어제 마감 회원이 0명이면 null',
    example: 2.1,
    nullable: true,
  })
  userChangeRate: number | null;

  @ApiProperty({
    description: '상장 상품 수 (거래 중·거래 중지)',
    example: 36,
  })
  listedStockCount: number;

  @ApiProperty({
    description:
      '상장 상품 전일 대비 증감 건수. 어제 일별 통계가 없으면 null (00시 직후 집계 전 등)',
    example: 3,
    nullable: true,
  })
  listedStockChange: number | null;

  @ApiProperty({
    description: '처리 대기 건수 (상장 심사 대기 + 계정 문의 대기)',
    example: 8,
  })
  pendingCount: number;

  @ApiProperty({
    description: '상장 심사 대기 건수 (SUBMITTED)',
    example: 5,
  })
  pendingListingCount: number;

  @ApiProperty({
    description: '계정 문의 대기 건수 (접수·처리 중). [계정 문의]는 ADM-INQ-01',
    example: 3,
  })
  pendingInquiryCount: number;

  @ApiProperty({
    description: '처리 대기 전일 대비 증감 건수. 어제 일별 통계가 없으면 null',
    example: 2,
    nullable: true,
  })
  pendingChange: number | null;

  @ApiProperty({
    description: '이상 거래 건수. 오늘(한국 시간 00시부터) 탐지된 건수',
    example: 3,
  })
  anomalyCount: number;

  @ApiProperty({
    description: '이상 거래 전일 대비 증감 건수 (오늘 - 어제 탐지 건수)',
    example: 1,
  })
  anomalyChange: number;
}
