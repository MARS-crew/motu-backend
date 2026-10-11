import { Injectable } from '@nestjs/common';
import { HealthCheckResDto } from './dto/res/health-check-res.dto.js';

@Injectable()
export class HealthService {
  check(): HealthCheckResDto {
    return { status: 'ok' };
  }
}
