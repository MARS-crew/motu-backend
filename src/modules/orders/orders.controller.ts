import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
import { GetOrderAvailableReqDto } from './dto/req/get-order-available-req.dto.js';
import { GetOrdersReqDto } from './dto/req/get-orders-req.dto.js';
import { GetOrderAvailableResDto } from './dto/res/get-order-available-res.dto.js';
import { GetOrderResDto } from './dto/res/get-order-res.dto.js';
import { GetOrdersResDto } from './dto/res/get-orders-res.dto.js';
import { OrderResDto } from './dto/res/order-res.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: '주문하기',
    description:
      '지정가 주문을 접수하고 호가창과 바로 체결한다. 응답의 status로 체결 여부를 알 수 있다. 매수는 주문 금액과 수수료만큼 포인트를, 매도는 주문 수량만큼 보유 수량을 예약한다. 규칙에 어긋나면 details에 해당 규칙 값을 담는다. 같은 clientOrderId로 다시 보내면 새로 접수하지 않고 접수된 주문을 돌려준다.',
  })
  @ApiCreatedResponse({ type: OrderResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / ORDER_INVALID_PRICE_TICK / ORDER_PRICE_TOO_LOW / ORDER_QTY_TOO_LOW / ORDER_INSUFFICIENT_CASH / ORDER_INSUFFICIENT_QTY',
  })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND / ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'ORDER_STOCK_NOT_TRADABLE / ORDER_SELF_TRADE / ORDER_CLIENT_ID_REUSED',
  })
  placeOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderReqDto,
  ): Promise<OrderResDto> {
    return this.ordersService.placeOrder(user.userId, dto);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '주문 취소',
    description:
      '미체결 수량을 취소하고 남은 예약(매수 포인트, 매도 수량)을 푼다. 일부 체결된 주문은 남은 수량만 취소된다. 이미 취소된 주문이면 그대로 돌려준다.',
  })
  @ApiOkResponse({ type: OrderResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST (orderId가 숫자가 아님)' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ORDER_NOT_CANCELABLE' })
  cancelOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: number,
  ): Promise<OrderResDto> {
    return this.ordersService.cancelOrder(user.userId, orderId);
  }

  @Get()
  @ApiOperation({
    summary: '내 주문 목록',
    description: '최근 주문순. 기본은 미체결 주문(OPEN)이다.',
  })
  @ApiOkResponse({ type: GetOrdersResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST / ORDER_INVALID_CURSOR' })
  getOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: GetOrdersReqDto,
  ): Promise<GetOrdersResDto> {
    return this.ordersService.getOrders(user.userId, query);
  }

  // ':orderId'보다 먼저 선언해야 'available'이 주문 ID로 해석되지 않는다.
  @Get('available')
  @ApiOperation({
    summary: '주문 가능 정보',
    description:
      '주문 화면에 들어갈 때 호출한다. 호가 단위, 최소 주문 가격·수량, 수수료율, 사용 가능 포인트, 매도 가능 수량을 내려준다.',
  })
  @ApiOkResponse({ type: GetOrderAvailableResDto })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND / ACCOUNT_NOT_FOUND' })
  getAvailable(
    @CurrentUser() user: AuthUser,
    @Query() query: GetOrderAvailableReqDto,
  ): Promise<GetOrderAvailableResDto> {
    return this.ordersService.getAvailable(user.userId, query.stockId);
  }

  @Get(':orderId')
  @ApiOperation({ summary: '주문 상세 (체결 내역 포함)' })
  @ApiOkResponse({ type: GetOrderResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST (orderId가 숫자가 아님)' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  getOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: number,
  ): Promise<GetOrderResDto> {
    return this.ordersService.getOrder(user.userId, orderId);
  }
}
