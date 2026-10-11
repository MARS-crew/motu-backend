import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * 전역 모듈이라 각 도메인 모듈에서 import 없이 PrismaService를 주입받을 수 있다.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
