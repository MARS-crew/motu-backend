import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SearchHistoriesService } from './search-histories.service.js';

describe('SearchHistoriesService', () => {
  const searchHistory = {
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma = {
    searchHistory,
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ searchHistory }),
    ),
  } as unknown as PrismaService;
  const service = new SearchHistoriesService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    searchHistory.deleteMany.mockResolvedValue({ count: 1 });
  });

  describe('record', () => {
    it('같은 검색어는 새로 만들지 않고 검색 시각만 갱신한다', async () => {
      searchHistory.findMany.mockResolvedValue([]);

      await service.record(1, '클라우드');

      expect(searchHistory.upsert).toHaveBeenCalledWith({
        where: { userId_keyword: { userId: 1, keyword: '클라우드' } },
        create: expect.objectContaining({ userId: 1, keyword: '클라우드' }),
        update: { modifiedDate: expect.any(Date) },
      });
      expect(searchHistory.deleteMany).not.toHaveBeenCalled();
    });

    it('최근 5개를 넘는 검색어는 지운다', async () => {
      searchHistory.findMany.mockResolvedValue([{ id: 3 }]);

      await service.record(1, '핀테크');

      expect(searchHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 }, skip: 5 }),
      );
      expect(searchHistory.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [3] } },
      });
    });
  });

  it('최근 검색순으로 내려준다', async () => {
    const searchedAt = new Date();
    searchHistory.findMany.mockResolvedValue([
      { id: 2, keyword: '핀테크', modifiedDate: searchedAt },
    ]);

    await expect(service.getSearchHistories(1)).resolves.toEqual({
      items: [{ searchHistoryId: 2, keyword: '핀테크', searchedAt }],
    });
    expect(searchHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ modifiedDate: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    );
  });

  it('내 검색어가 아니거나 없으면 404', async () => {
    searchHistory.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteSearchHistory(1, 99)).rejects.toMatchObject({
      response: { code: 'SEARCH_HISTORY_NOT_FOUND' },
    });
    expect(searchHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: 99, userId: 1 },
    });
  });
});
