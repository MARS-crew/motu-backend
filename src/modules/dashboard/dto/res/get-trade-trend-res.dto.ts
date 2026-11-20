import { ApiProperty } from '@nestjs/swagger';
import { TradeTrendRange, TradeTrendUnit } from '../../dashboard.constants.js';

export class TradeTrendBucketResDto {
  @ApiProperty({
    description: '구간 시작 시각. 월별은 그 달 1일 00시(한국 시간)',
    example: '2026-09-10T15:00:00.000Z',
  })
  time: Date;

  @ApiProperty({ description: '구간 거래량 (주)', example: 4_200 })
  volume: number;

  @ApiProperty({ description: '구간 거래대금 (P)', example: 24_500_000 })
  tradeAmount: number;
}

export class GetTradeTrendResDto {
  @ApiProperty({ description: '조회 기간', enum: TradeTrendRange })
  range: TradeTrendRange;

  @ApiProperty({
    description:
      '집계 단위 (MINUTE_5 5분, MINUTE_30 30분, HOUR 1시간, HOUR_3 3시간, DAY 일, MONTH 월)',
    enum: TradeTrendUnit,
  })
  unit: TradeTrendUnit;

  @ApiProperty({
    description:
      '조회 시작 시각 (포함). CUSTOM 월별에서 요청 시작일이 첫 체결일보다 이르면 첫 체결일이다.',
    example: '2026-09-10T15:00:00.000Z',
  })
  from: Date;

  @ApiProperty({
    description: '조회 끝 시각 (포함하지 않음)',
    example: '2026-09-11T15:00:00.000Z',
  })
  to: Date;

  @ApiProperty({
    description: '화면에 보여줄 기간 (한국 시간)',
    example: '2026.09.11 00:00 ~ 24:00',
  })
  periodLabel: string;

  @ApiProperty({ description: '선택 구간 거래량 합계 (주)', example: 82_400 })
  totalVolume: number;

  @ApiProperty({
    description: '선택 구간 거래대금 합계 (P)',
    example: 480_000_000,
  })
  totalTradeAmount: number;

  @ApiProperty({
    description: '구간별 합계. 시간순이며 체결이 없는 구간도 0으로 들어간다.',
    type: [TradeTrendBucketResDto],
  })
  buckets: TradeTrendBucketResDto[];
}
