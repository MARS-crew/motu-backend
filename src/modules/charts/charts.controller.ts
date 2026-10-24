import {
  Controller,
  Get,
  MessageEvent,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiProduces,
  ApiQuery,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Public } from '../../common/auth/public.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { ChartsService } from './charts.service.js';
import { ExistingStockGuard } from './existing-stock.guard.js';
import { MarketStreamService } from './market-stream.service.js';
import { GetCandlesReqDto } from './dto/req/get-candles-req.dto.js';
import { GetDailySummaryReqDto } from './dto/req/get-daily-summary-req.dto.js';
import { GetCandlesResDto } from './dto/res/get-candles-res.dto.js';
import { GetDailySummaryResDto } from './dto/res/get-daily-summary-res.dto.js';

@ApiTags('Charts')
@Public()
@Controller('charts')
export class ChartsController {
  constructor(
    private readonly chartsService: ChartsService,
    private readonly marketStreamService: MarketStreamService,
  ) {}

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

  @Sse('stream')
  // 스트림을 시작하기 전에 상품을 확인해야 404로 응답할 수 있다.
  @UseGuards(ExistingStockGuard)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '실시간 시세 (SSE)',
    description: [
      'EventSource로 연결한다. 연결하면 현재 orderbook과 summary를 먼저 보낸다.',
      '- trade: 체결마다 { tradeId, price, qty, side, createDate }',
      '- orderbook: 호가창이 바뀔 때 { stockId, asks, bids } (호가 5단계와 같은 형식)',
      '- summary: 체결 후 당일 요약 (당일 거래 요약과 같은 형식)',
      '- candles: 체결 후 마지막 체결이 속한 봉 { stockId, items: [{ interval, time, openPrice, ... }] }',
      'orderbook·summary·candles는 짧은 시간(100ms)의 변경을 모아 마지막 상태만 보낸다. 15초마다 연결 유지용 주석(: ping)을 보낸다.',
    ].join('\n'),
  })
  @ApiOkResponse({
    description:
      'text/event-stream. 이벤트 이름(event)은 trade, orderbook, summary, candles이고 data는 JSON이다.',
  })
  @ApiQuery({
    name: 'stockId',
    type: Number,
    description: '상품 ID',
    example: 1,
  })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST (stockId가 숫자가 아님)' })
  @ApiNotFoundResponse({
    description:
      'STOCK_NOT_FOUND. 일반 API처럼 JSON으로 응답하므로 EventSource는 다시 연결하지 않는다.',
  })
  stream(
    @Query('stockId', ParseIdPipe) stockId: number,
  ): Observable<MessageEvent> {
    return this.marketStreamService.openStream(stockId);
  }
}
