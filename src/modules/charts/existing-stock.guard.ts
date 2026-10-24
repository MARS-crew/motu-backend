import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StockErrors } from '../stocks/stocks.errors.js';

/**
 * 쿼리의 stockId가 삭제되지 않은 상품인지 확인한다. 없으면 404를 낸다.
 *
 * SSE는 Nest가 응답 헤더를 일찍 보내므로, 핸들러나 비동기 pipe에서 난 에러는 404가 아니라
 * 200 + error 이벤트가 되고 EventSource가 계속 다시 연결한다. guard는 응답을 시작하기 전에 끝까지 실행된다.
 * 형식 검사는 하지 않는다. 형식이 잘못되면 그대로 통과시키고 ParseIdPipe가 400을 낸다.
 */
@Injectable()
export class ExistingStockGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { stockId } = context.switchToHttp().getRequest<Request>().query;
    if (typeof stockId !== 'string' || !/^\d+$/.test(stockId)) {
      return true;
    }
    const stock = await this.prisma.stock.findFirst({
      where: { id: Number(stockId), isDeleted: false },
      select: { id: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    return true;
  }
}
