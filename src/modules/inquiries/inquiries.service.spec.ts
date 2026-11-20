import { PrismaService } from '../../common/prisma/prisma.service.js';
import { InquiriesService } from './inquiries.service.js';

describe('이전 문의의 읽기 전용 조회', () => {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const count = vi.fn();
  const transaction = vi.fn();
  const service = new InquiriesService({
    $transaction: transaction,
    inquiry: { findFirst, findMany, count },
  } as unknown as PrismaService);
  beforeEach(() => vi.resetAllMocks());

  it.each([0, -1, 2147483648, Number.NaN])(
    '범위 밖 ID %s는 DB에 보내지 않는다',
    async (id) => {
      await expect(service.detail(1, id)).rejects.toMatchObject({
        response: { code: 'INQUIRY_NOT_FOUND' },
      });
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it('타인 문의와 없는 문의는 같은 404로 보호한다', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.detail(1, 7)).rejects.toMatchObject({
      response: { code: 'INQUIRY_NOT_FOUND' },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, userId: 1 } }),
    );
  });
  it('목록과 건수 모두 작성자로 제한하고 같은 스냅샷에서 조회한다', async () => {
    findMany.mockResolvedValue([{ id: 7 }]);
    count.mockResolvedValue(1);
    transaction.mockImplementation((queries) => Promise.all(queries));
    await expect(service.list(1, 2, 10)).resolves.toEqual({
      items: [{ id: 7 }],
      page: 2,
      size: 10,
      totalCount: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 }, skip: 10, take: 10 }),
    );
    expect(count).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
  });
});
