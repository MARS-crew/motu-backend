import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { GetRecentTradesReqDto } from './dto/req/get-recent-trades-req.dto.js';
import { GetRecentTradesResDto } from './dto/res/get-recent-trades-res.dto.js';
import { TradesService } from './trades.service.js';

@ApiTags('Trades')
@Public()
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get('recent')
  @ApiOperation({
    summary: '최근 체결 5건',
    description:
      '상품 상세의 최근 체결 목록. 최신순 최대 5건이고, side로 매수 체결(빨강)과 매도 체결(파랑)을 구분한다.',
  })
  @ApiOkResponse({ type: GetRecentTradesResDto })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  getRecentTrades(
    @Query() query: GetRecentTradesReqDto,
  ): Promise<GetRecentTradesResDto> {
    return this.tradesService.getRecentTrades(query.stockId);
  }
}
