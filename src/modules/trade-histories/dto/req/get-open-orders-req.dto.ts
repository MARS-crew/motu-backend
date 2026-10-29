import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { OpenOrderSort } from '../../trade-histories.constants.js';
import { TradeHistoryPageReqDto } from './trade-history-page-req.dto.js';

/** 미체결주문 목록 요청 */
export class GetOpenOrdersReqDto extends TradeHistoryPageReqDto {
  @ApiPropertyOptional({
    description: 'LATEST 최신순 / AMOUNT 주문 금액 큰 순',
    enum: OpenOrderSort,
    default: OpenOrderSort.LATEST,
  })
  @IsOptional()
  @IsEnum(OpenOrderSort, { message: INVALID_REQUEST_MESSAGE })
  sort: OpenOrderSort = OpenOrderSort.LATEST;
}
