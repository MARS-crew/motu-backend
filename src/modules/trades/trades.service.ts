import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}
}
