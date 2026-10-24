import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { CreateOrderReqDto } from './dto/req/create-order-req.dto.js';
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
      '지정가 주문을 접수한다. 매수는 주문 금액과 수수료만큼 포인트를 예약한다. 규칙에 어긋나면 details에 해당 규칙 값을 담는다.',
  })
  @ApiCreatedResponse({ type: OrderResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / ORDER_INVALID_PRICE_TICK / ORDER_PRICE_TOO_LOW / ORDER_QTY_TOO_LOW / ORDER_INSUFFICIENT_CASH',
  })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND / ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ORDER_STOCK_NOT_TRADABLE' })
  placeOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderReqDto,
  ): Promise<OrderResDto> {
    return this.ordersService.placeOrder(user.userId, dto);
  }
}
