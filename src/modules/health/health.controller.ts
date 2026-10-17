import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { HealthCheckResDto } from './dto/res/health-check-res.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '서버 상태 확인' })
  @ApiOkResponse({ type: HealthCheckResDto })
  check(): HealthCheckResDto {
    return this.healthService.check();
  }
}
