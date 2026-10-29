import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { TradeHistorySort } from '../../trade-histories.constants.js';
import { TradeHistoryPageReqDto } from './trade-history-page-req.dto.js';

/** 거래내역·체결주문 목록 요청 */
export class GetTradeHistoriesReqDto extends TradeHistoryPageReqDto {
  @ApiPropertyOptional({
    description: 'LATEST 최신순 / AMOUNT 금액 큰 순 / STOCK_NAME 상품명순',
    enum: TradeHistorySort,
    default: TradeHistorySort.LATEST,
  })
  @IsOptional()
  @IsEnum(TradeHistorySort, { message: INVALID_REQUEST_MESSAGE })
  sort: TradeHistorySort = TradeHistorySort.LATEST;
}
