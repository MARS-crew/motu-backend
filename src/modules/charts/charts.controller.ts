import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { ChartsService } from './charts.service.js';
import { GetCandlesReqDto } from './dto/req/get-candles-req.dto.js';
import { GetDailySummaryReqDto } from './dto/req/get-daily-summary-req.dto.js';
import { GetCandlesResDto } from './dto/res/get-candles-res.dto.js';
import { GetDailySummaryResDto } from './dto/res/get-daily-summary-res.dto.js';

@ApiTags('Charts')
@Public()
@Controller('charts')
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Get('summary')
  @ApiOperation({
    summary: '당일 거래 요약',
    description:
      '현재가, 전일 대비, 등락률과 오늘(한국 시간 00시 기준)의 시가·고가·저가·거래량·거래대금. 체결된 적이 없으면 현재가와 전일 종가는 기준가다.',
  })
  @ApiOkResponse({ type: GetDailySummaryResDto })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  getDailySummary(
    @Query() query: GetDailySummaryReqDto,
  ): Promise<GetDailySummaryResDto> {
    return this.chartsService.getDailySummary(query.stockId);
  }

  @Get()
  @ApiOperation({
    summary: '기간별 차트',
    description:
      '봉 단위별 시가·고가·저가·종가·거래량·거래대금. 최신 봉부터 size개를 오래된 순으로 내려주고, 과거로 스크롤하면 nextCursor로 이전 봉을 이어서 읽는다. 체결이 없던 구간의 봉은 없다.',
  })
  @ApiOkResponse({ type: GetCandlesResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST / CHART_INVALID_CURSOR' })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  getCandles(@Query() query: GetCandlesReqDto): Promise<GetCandlesResDto> {
    return this.chartsService.getCandles(query);
  }
}
