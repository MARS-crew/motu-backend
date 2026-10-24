import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { NoticeType } from '../../generated/prisma/client.js';
import { NoticesService } from './notices.service.js';

const NOW = new Date('2026-10-23T03:00:00.000Z');

describe('NoticesService', () => {
  const notice = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  };
  const prisma = {
    notice,
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  } as unknown as PrismaService;
  const service = new NoticesService(prisma);

  const postedWhere = {
    isDeleted: false,
    postStartDate: { lte: NOW },
    OR: [{ postEndDate: null }, { postEndDate: { gt: NOW } }],
  };

  const noticeOf = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    type: NoticeType.ALL,
    title: `공지${id}`,
    content: `내용${id}`,
    isImportant: false,
    postStartDate: new Date('2026-10-20T00:00:00.000Z'),
    postEndDate: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getNotices', () => {
    it('게시 중인 공지를 중요 공지 먼저, 최근 게시순으로 페이지 번호에 맞춰 조회한다', async () => {
      notice.findMany.mockResolvedValue([
        noticeOf(2, { isImportant: true }),
        noticeOf(3),
      ]);
      notice.count.mockResolvedValue(12);

      const result = await service.getNotices(2, 10);

      expect(notice.findMany).toHaveBeenCalledWith({
        where: postedWhere,
        orderBy: [
          { isImportant: 'desc' },
          { postStartDate: 'desc' },
          { id: 'desc' },
        ],
        skip: 10,
        take: 10,
      });
      expect(notice.count).toHaveBeenCalledWith({ where: postedWhere });
      expect(result).toEqual({
        items: [
          {
            noticeId: 2,
            type: NoticeType.ALL,
            title: '공지2',
            isImportant: true,
            postDate: new Date('2026-10-20T00:00:00.000Z'),
          },
          expect.objectContaining({ noticeId: 3, isImportant: false }),
        ],
        page: 2,
        size: 10,
        totalCount: 12,
      });
    });
  });

  describe('getLatestNotice', () => {
    it('중요 공지 여부와 상관없이 가장 최근에 게시된 공지를 내려준다', async () => {
      notice.findFirst.mockResolvedValue(noticeOf(5));

      const result = await service.getLatestNotice();

      expect(notice.findFirst).toHaveBeenCalledWith({
        where: postedWhere,
        orderBy: [{ postStartDate: 'desc' }, { id: 'desc' }],
      });
      expect(result.notice).toEqual(expect.objectContaining({ noticeId: 5 }));
    });

    it('게시 중인 공지가 없으면 null이다', async () => {
      notice.findFirst.mockResolvedValue(null);

      await expect(service.getLatestNotice()).resolves.toEqual({
        notice: null,
      });
    });
  });

  describe('getNotice', () => {
    it('게시 중인 공지면 내용까지 내려준다', async () => {
      notice.findFirst.mockResolvedValue(
        noticeOf(1, { type: NoticeType.STOCK }),
      );

      const result = await service.getNotice(1);

      expect(notice.findFirst).toHaveBeenCalledWith({
        where: { AND: [{ id: 1 }, postedWhere] },
      });
      expect(result).toEqual(
        expect.objectContaining({
          noticeId: 1,
          type: NoticeType.STOCK,
          content: '내용1',
        }),
      );
    });

    it('없거나 게시 기간이 아닌 공지면 NOTICE_NOT_FOUND', async () => {
      notice.findFirst.mockResolvedValue(null);

      await expect(service.getNotice(99)).rejects.toThrow(BusinessException);
      await expect(service.getNotice(99)).rejects.toMatchObject({
        error: { code: 'NOTICE_NOT_FOUND' },
      });
    });
  });
});
