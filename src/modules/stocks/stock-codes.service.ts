import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { StockErrors } from './stocks.errors.js';

@Injectable()
export class StockCodesService {
  /** 생성 트랜잭션 안에서 호출한다. soft-delete·seed 코드를 포함해 같은 MOTU 이름 공간을 직렬화한다. */
  async next(tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('motu:stock-code'))`;
    const [row] = await tx.$queryRaw<{ next: bigint }[]>`
      SELECT COALESCE(MAX(SUBSTRING(stock_code FROM 5)::bigint), 0) + 1 AS next
      FROM stocks WHERE stock_code ~ '^MOTU[0-9]{1,16}$'
    `;
    if (!row || row.next > 9999999999999999n) {
      throw new BusinessException(StockErrors.CODE_EXHAUSTED);
    }
    return `MOTU${row.next.toString().padStart(4, '0')}`;
  }
}
