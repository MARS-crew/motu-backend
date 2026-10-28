import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
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
import { CreatePriceAlertReqDto } from './dto/req/create-price-alert-req.dto.js';
import { UpdatePriceAlertReqDto } from './dto/req/update-price-alert-req.dto.js';
import { PriceAlertResDto } from './dto/res/price-alert-res.dto.js';
import { PriceAlertsService } from './price-alerts.service.js';

@ApiTags('Price Alerts')
@ApiBearerAuth()
@Controller('price-alerts')
export class PriceAlertsController {
  constructor(private readonly priceAlertsService: PriceAlertsService) {}

  @Post()
  @ApiOperation({
    summary: '지정가 알림 설정',
    description:
      '체결가가 설정 가격에 처음 도달하면 알림을 한 번 보낸다. 오르든 내리든 설정 가격에 닿거나 지나치면 도달로 본다. 한 상품에 가격이 다른 알림을 여러 개 설정할 수 있다. 규칙에 어긋나면 details에 해당 규칙 값을 담는다.',
  })
  @ApiCreatedResponse({ type: PriceAlertResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / PRICE_ALERT_INVALID_PRICE_TICK / PRICE_ALERT_PRICE_TOO_LOW / PRICE_ALERT_SAME_AS_CURRENT_PRICE',
  })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'PRICE_ALERT_STOCK_NOT_ALERTABLE / PRICE_ALERT_DUPLICATE',
  })
  createAlert(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePriceAlertReqDto,
  ): Promise<PriceAlertResDto> {
    return this.priceAlertsService.createAlert(user.userId, dto);
  }

  @Patch(':alertId')
  @ApiOperation({
    summary: '지정가 알림 수정',
    description:
      '설정 가격을 바꾸고 알림을 다시 켠다. 이미 울린 알림도 다시 울릴 수 있게 되며, 같은 가격으로 수정해도 다시 켜진다.',
  })
  @ApiOkResponse({ type: PriceAlertResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / PRICE_ALERT_INVALID_PRICE_TICK / PRICE_ALERT_PRICE_TOO_LOW / PRICE_ALERT_SAME_AS_CURRENT_PRICE',
  })
  @ApiNotFoundResponse({ description: 'PRICE_ALERT_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'PRICE_ALERT_STOCK_NOT_ALERTABLE / PRICE_ALERT_DUPLICATE',
  })
  updateAlert(
    @CurrentUser() user: AuthUser,
    @Param('alertId', ParseIdPipe) alertId: number,
    @Body() dto: UpdatePriceAlertReqDto,
  ): Promise<PriceAlertResDto> {
    return this.priceAlertsService.updateAlert(
      user.userId,
      alertId,
      dto.targetPrice,
    );
  }
}
