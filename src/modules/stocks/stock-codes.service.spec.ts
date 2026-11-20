import type { Prisma } from '../../generated/prisma/client.js';
import { StockCodesService } from './stock-codes.service.js';

describe('MOTU 상품 코드 발급', () => {
  const service = new StockCodesService();
  it.each([
    [1n, 'MOTU0001'],
    [43n, 'MOTU0043'],
    [10000n, 'MOTU10000'],
  ])('기존 코드 다음 번호 %s를 같은 형식으로 만든다', async (next, code) => {
    const execute = vi.fn().mockResolvedValue(1);
    const query = vi.fn().mockResolvedValue([{ next }]);
    expect(
      await service.next({
        $executeRaw: execute,
        $queryRaw: query,
      } as unknown as Prisma.TransactionClient),
    ).toBe(code);
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
      query.mock.invocationCallOrder[0],
    );
  });
  it('저장 길이를 넘는 코드 발급을 차단한다', async () => {
    await expect(
      service.next({
        $executeRaw: vi.fn().mockResolvedValue(1),
        $queryRaw: vi.fn().mockResolvedValue([{ next: 10000000000000000n }]),
      } as unknown as Prisma.TransactionClient),
    ).rejects.toThrow();
  });
});
