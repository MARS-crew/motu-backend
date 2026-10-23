import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TradesService } from './trades.service.js';

@ApiTags('Trades')
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}
}
