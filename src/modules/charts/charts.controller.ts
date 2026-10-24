import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { ChartsService } from './charts.service.js';
import { GetDailySummaryReqDto } from './dto/req/get-daily-summary-req.dto.js';
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
}
