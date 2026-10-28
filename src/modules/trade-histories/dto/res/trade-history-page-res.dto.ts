import { ApiProperty } from '@nestjs/swagger';

/** 조회 기간과 페이지 정보. 목록 응답이 함께 쓴다. */
export class TradeHistoryPageResDto {
  @ApiProperty({
    description: '조회 시작일 (한국 날짜)',
    example: '2026-10-01',
  })
  from: string;

  @ApiProperty({
    description: '조회 종료일 (한국 날짜, 포함)',
    example: '2026-10-28',
  })
  to: string;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 23 })
  totalCount: number;
}
