import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PriceAlertsService } from './price-alerts.service.js';

@ApiTags('Price Alerts')
@Controller('price-alerts')
export class PriceAlertsController {
  constructor(private readonly priceAlertsService: PriceAlertsService) {}
}
