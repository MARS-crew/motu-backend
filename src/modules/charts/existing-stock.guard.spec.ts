import { ExecutionContext } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { ExistingStockGuard } from './existing-stock.guard.js';

describe('ExistingStockGuard', () => {
  const stock = { findFirst: vi.fn() };
  const guard = new ExistingStockGuard({ stock } as unknown as PrismaService);
  const contextOf = (query: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ query }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('쿼리의 stockId가 삭제되지 않은 상품이면 통과시킨다', async () => {
    stock.findFirst.mockResolvedValue({ id: 1 });

    await expect(guard.canActivate(contextOf({ stockId: '1' }))).resolves.toBe(
      true,
    );
    expect(stock.findFirst).toHaveBeenCalledWith({
      where: { id: 1, isDeleted: false },
      select: { id: true },
    });
  });

  it('없거나 삭제된 상품이면 404를 낸다', async () => {
    stock.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextOf({ stockId: '999' })),
    ).rejects.toSatisfy(
      (error: BusinessException) => error.error === StockErrors.NOT_FOUND,
    );
  });

  it.each([undefined, 'abc', '1.5', ['1', '2']])(
    'stockId 형식이 잘못되면(%s) 조회하지 않고 통과시켜 요청 값 검증에 맡긴다',
    async (stockId) => {
      await expect(guard.canActivate(contextOf({ stockId }))).resolves.toBe(
        true,
      );
      expect(stock.findFirst).not.toHaveBeenCalled();
    },
  );
});
