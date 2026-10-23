import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChartsService } from './charts.service.js';

@ApiTags('Charts')
@Controller('charts')
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}
}
