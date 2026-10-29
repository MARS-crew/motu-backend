import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { TRADE_HISTORY_PAGE_SIZE } from '../../trade-histories.constants.js';
import { TradeHistoryPeriodReqDto } from './trade-history-period-req.dto.js';

/** 조회 기간과 페이지 번호 */
export class TradeHistoryPageReqDto extends TradeHistoryPeriodReqDto {
  @ApiPropertyOptional({
    description: '페이지 (1부터)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({
    description: '한 페이지 건수 (최대 50)',
    example: TRADE_HISTORY_PAGE_SIZE,
    default: TRADE_HISTORY_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(50, { message: INVALID_REQUEST_MESSAGE })
  size: number = TRADE_HISTORY_PAGE_SIZE;
}
