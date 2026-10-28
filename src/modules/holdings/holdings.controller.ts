import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HoldingsService } from './holdings.service.js';

@ApiTags('Holdings')
@Controller('holdings')
export class HoldingsController {
  constructor(private readonly holdingsService: HoldingsService) {}
}
