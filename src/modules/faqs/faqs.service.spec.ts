import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FaqCategory } from '../../generated/prisma/client.js';
import { FaqCategoryFilter } from './faqs.constants.js';
import { FaqsService } from './faqs.service.js';

describe('FaqsService', () => {
  const findMany = vi.fn();
  const prisma = { faq: { findMany } } as unknown as PrismaService;
  const service = new FaqsService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([
      {
        id: 1,
        category: FaqCategory.ACCOUNT,
        question: '2차 보안은 무엇인가요?',
        answer: '답변',
        sortOrder: 1,
      },
    ]);
  });

  it('카테고리를 넘기면 그 카테고리만 노출 순서대로 조회한다', async () => {
    const result = await service.getFaqs(FaqCategory.ACCOUNT);

    expect(findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, category: FaqCategory.ACCOUNT },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    expect(result).toEqual({
      items: [
        {
          faqId: 1,
          category: FaqCategory.ACCOUNT,
          question: '2차 보안은 무엇인가요?',
          answer: '답변',
        },
      ],
    });
  });

  it('ALL이면 전체를 조회한다', async () => {
    await service.getFaqs(FaqCategoryFilter.ALL);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false } }),
    );
  });
});
