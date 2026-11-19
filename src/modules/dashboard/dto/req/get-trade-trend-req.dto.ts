import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, Matches } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { TradeTrendRange } from '../../dashboard.constants.js';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FORMAT_MESSAGE = '조회 기간은 YYYY-MM-DD 형식으로 입력해 주세요.';

export class GetTradeTrendReqDto {
  @ApiProperty({
    description:
      '조회 기간. HOUR_1 최근 1시간(5분), HOUR_6 최근 6시간(30분), DAY_1 오늘(3시간), WEEK_1 최근 7일(일별), MONTH_1 최근 30일(일별), ALL 첫 체결일부터(월별), CUSTOM 직접 설정(1일 이내 1시간, 31일 이내 일별, 초과 시 월별). 한국 시간 기준',
    enum: TradeTrendRange,
    example: TradeTrendRange.DAY_1,
  })
  @IsEnum(TradeTrendRange, { message: INVALID_REQUEST_MESSAGE })
  range: TradeTrendRange;

  @ApiPropertyOptional({
    description: '직접 설정 시작일 (YYYY-MM-DD, 한국 날짜). CUSTOM이면 필수',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({ strict: true }, { message: DATE_FORMAT_MESSAGE })
  @Matches(DATE_FORMAT, { message: DATE_FORMAT_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description:
      '직접 설정 종료일 (YYYY-MM-DD, 한국 날짜, 포함). CUSTOM이면 필수이고 오늘까지',
    example: '2026-09-11',
  })
  @IsOptional()
  @IsDateString({ strict: true }, { message: DATE_FORMAT_MESSAGE })
  @Matches(DATE_FORMAT, { message: DATE_FORMAT_MESSAGE })
  to?: string;
}
