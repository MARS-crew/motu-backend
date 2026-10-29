import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { GetOpenOrdersReqDto } from './dto/req/get-open-orders-req.dto.js';
import { GetTradeHistoriesReqDto } from './dto/req/get-trade-histories-req.dto.js';
import { TradeHistoryPeriodReqDto } from './dto/req/trade-history-period-req.dto.js';
import { GetFilledOrdersResDto } from './dto/res/get-filled-orders-res.dto.js';
import { GetOpenOrdersResDto } from './dto/res/get-open-orders-res.dto.js';
import { GetTradeHistoriesResDto } from './dto/res/get-trade-histories-res.dto.js';
import { GetTradeHistorySummaryResDto } from './dto/res/get-trade-history-summary-res.dto.js';
import { TradeHistoriesService } from './trade-histories.service.js';

@ApiTags('Trade Histories')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'BAD_REQUEST / TRADE_HISTORY_INVALID_PERIOD',
})
@ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
@Controller('trade-histories')
export class TradeHistoriesController {
  constructor(private readonly tradeHistoriesService: TradeHistoriesService) {}

  @Get()
  @ApiOperation({
    summary: '거래내역',
    description:
      '조회 기간의 내 체결을 한 건씩 보여준다. 기간을 비우면 이번 달 1일 ~ 오늘이다. 포인트 리셋 이전 거래는 나오지 않는다.',
  })
  @ApiOkResponse({ type: GetTradeHistoriesResDto })
  getTradeHistories(
    @CurrentUser() user: AuthUser,
    @Query() query: GetTradeHistoriesReqDto,
  ): Promise<GetTradeHistoriesResDto> {
    return this.tradeHistoriesService.getTradeHistories(user.userId, query);
  }

  @Get('summary')
  @ApiOperation({
    summary: '거래 요약',
    description:
      '조회 기간의 총·매수·매도 거래금액 (체결가 × 수량, 수수료 제외)',
  })
  @ApiOkResponse({ type: GetTradeHistorySummaryResDto })
  getSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: TradeHistoryPeriodReqDto,
  ): Promise<GetTradeHistorySummaryResDto> {
    return this.tradeHistoriesService.getSummary(user.userId, query);
  }

  @Get('filled-orders')
  @ApiOperation({
    summary: '체결주문',
    description:
      '조회 기간에 체결이 있었던 내 주문. 부분 체결이면 실제 체결된 수량과 금액만 보여준다.',
  })
  @ApiOkResponse({ type: GetFilledOrdersResDto })
  getFilledOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: GetTradeHistoriesReqDto,
  ): Promise<GetFilledOrdersResDto> {
    return this.tradeHistoriesService.getFilledOrders(user.userId, query);
  }

  @Get('open-orders')
  @ApiOperation({
    summary: '미체결주문',
    description:
      '조회 기간에 접수한 주문 중 미체결 수량이 남은 주문. 취소는 POST /orders/{orderId}/cancel을 쓴다.',
  })
  @ApiOkResponse({ type: GetOpenOrdersResDto })
  getOpenOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: GetOpenOrdersReqDto,
  ): Promise<GetOpenOrdersResDto> {
    return this.tradeHistoriesService.getOpenOrders(user.userId, query);
  }
}
