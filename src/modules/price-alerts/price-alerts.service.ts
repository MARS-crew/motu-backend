import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class PriceAlertsService {
  constructor(private readonly prisma: PrismaService) {}
}
