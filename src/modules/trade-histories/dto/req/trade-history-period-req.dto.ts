import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FORMAT_MESSAGE = '조회 기간은 YYYY-MM-DD 형식으로 입력해 주세요.';

/** 조회 기간. 한국 날짜 기준이며 시작일·종료일을 모두 포함한다. */
export class TradeHistoryPeriodReqDto {
  @ApiPropertyOptional({
    description: '조회 시작일 (YYYY-MM-DD, 한국 날짜). 비우면 이번 달 1일',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString({ strict: true }, { message: DATE_FORMAT_MESSAGE })
  @Matches(DATE_FORMAT, { message: DATE_FORMAT_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description: '조회 종료일 (YYYY-MM-DD, 한국 날짜, 포함). 비우면 오늘',
    example: '2026-10-28',
  })
  @IsOptional()
  @IsDateString({ strict: true }, { message: DATE_FORMAT_MESSAGE })
  @Matches(DATE_FORMAT, { message: DATE_FORMAT_MESSAGE })
  to?: string;
}
