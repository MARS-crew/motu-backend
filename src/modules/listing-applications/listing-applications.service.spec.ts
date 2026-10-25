import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { FilesService } from '../files/files.service.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import {
  LISTING_DRAFT_LIFETIME_MS,
  LISTING_DRAFT_WARNING_MS,
} from './listing-applications.constants.js';

describe('상장 신청 임시저장', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const model = {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
  };
  const tx = { $queryRaw: vi.fn(), listingApplication: model };
  const prisma = {
    listingApplication: model,
    $transaction: vi.fn(
      async (action: (value: typeof tx) => Promise<unknown>) => action(tx),
    ),
  };
  const files = { getSavedCollection: vi.fn() };
  const service = new ListingApplicationsService(
    prisma as unknown as PrismaService,
    files as unknown as FilesService,
  );
  const record = () => ({
    id: 1,
    userId: 1,
    status: 'DRAFT',
    serviceName: null,
    officialUrl: null,
    currentStep: 1,
    draftData: {},
    applicationNumber: null,
    lastSavedAt: now,
    expiresAt: new Date(now.getTime() + LISTING_DRAFT_LIFETIME_MS),
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.$transaction.mockImplementation(async (action) => action(tx));
    tx.$queryRaw.mockResolvedValue([{ user_id: 1 }]);
    model.count.mockResolvedValue(0);
    model.updateMany.mockResolvedValue({ count: 1 });
    model.create.mockImplementation(async ({ data }: { data: object }) => ({
      ...record(),
      ...data,
    }));
    model.findFirst.mockResolvedValue(record());
    model.findUniqueOrThrow.mockResolvedValue(record());
  });
  afterEach(() => vi.useRealTimers());

  it('빈 미완성 신청서에 접수번호 없이 90일 만료를 부여한다', async () => {
    const draft = await service.create(1, {});
    expect(draft.applicationNumber).toBeNull();
    expect(draft.expiresAt.getTime() - draft.lastSavedAt.getTime()).toBe(
      LISTING_DRAFT_LIFETIME_MS,
    );
    expect(draft.data).toEqual({});
    expect(tx.$queryRaw).toHaveBeenCalled();
  });
  it('5건이면 새 신청서를 생성하지 않는다', async () => {
    model.count.mockResolvedValue(5);
    await expect(service.create(1, {})).rejects.toMatchObject({
      error: { code: 'LISTING_DRAFT_LIMIT_EXCEEDED' },
    });
    expect(model.create).not.toHaveBeenCalled();
  });
  it('부분 수정에서 기존 필드를 보존하고 null만 초기화한다', async () => {
    model.findFirst.mockResolvedValue({
      ...record(),
      draftData: { serviceName: '기존 서비스', summary: '기존 소개' },
    });
    await service.save(1, 1, { data: { summary: null } });
    expect(model.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          draftData: { serviceName: '기존 서비스', summary: null },
          expiresAt: new Date(now.getTime() + LISTING_DRAFT_LIFETIME_MS),
        }),
      }),
    );
  });
  it.each(['EXPIRED', 'DRAFT'])(
    '만료 상태/시각의 %s 신청서는 갱신하지 않는다',
    async (status) => {
      model.findFirst.mockResolvedValue({
        ...record(),
        status,
        expiresAt: now,
      });
      await expect(service.save(1, 1, {})).rejects.toMatchObject({
        error: { code: 'LISTING_DRAFT_EXPIRED' },
      });
      expect(model.updateMany).toHaveBeenCalledTimes(1);
    },
  );
  it('타인 또는 없는 신청서는 404다', async () => {
    model.findFirst.mockResolvedValue(null);
    await expect(service.get(2, 1)).rejects.toMatchObject({
      error: { code: 'LISTING_APPLICATION_NOT_FOUND' },
    });
  });
  it('접수한 신청서는 임시저장으로 변경하지 않는다', async () => {
    model.findFirst.mockResolvedValue({ ...record(), status: 'SUBMITTED' });
    await expect(service.remove(1, 1)).rejects.toMatchObject({
      error: { code: 'LISTING_APPLICATION_NOT_DRAFT' },
    });
  });
  it('목록은 만료되지 않은 DRAFT만 최신 저장순으로 조회한다', async () => {
    model.count.mockResolvedValue(3);
    model.findMany.mockResolvedValue([record()]);
    const result = await service.list(1, 2);
    expect(result).toMatchObject({
      totalCount: 3,
      maxCount: 5,
      canCreate: true,
    });
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          status: 'DRAFT',
          deletedDate: null,
          expiresAt: { gt: now },
        }),
        orderBy: [{ lastSavedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
  it('만료 7일 경계부터 안내한다', async () => {
    for (const [remaining, expected] of [
      [LISTING_DRAFT_WARNING_MS + 1, false],
      [LISTING_DRAFT_WARNING_MS, true],
    ] as const) {
      model.findFirst.mockResolvedValue({
        ...record(),
        expiresAt: new Date(now.getTime() + remaining),
      });
      expect((await service.get(1, 1)).expiresSoon).toBe(expected);
    }
  });
  it('DB의 동시 URL 충돌을 도메인 409 코드로 바꾼다', async () => {
    model.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.create(1, { data: { officialUrl: 'https://example.com' } }),
    ).rejects.toMatchObject({ error: { code: 'LISTING_URL_IN_PROGRESS' } });
  });
  it('교착 상태는 제한된 횟수만 재시도한다', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(service.create(1, {})).rejects.toMatchObject({
      error: { code: 'LISTING_DRAFT_CONFLICT' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
  it('첨부 묶음의 용도를 확인한다', async () => {
    files.getSavedCollection.mockResolvedValue({ purpose: 'LOGO' });
    await expect(
      service.create(1, { data: { evidenceCollectionId: 'collection' } }),
    ).rejects.toMatchObject({ error: { code: 'LISTING_INVALID_ATTACHMENT' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('주기 만료는 접수 상태·삭제 건을 변경하지 않는 조건을 사용한다', async () => {
    await service.expireDueDrafts(now);
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { status: 'DRAFT', deletedDate: null, expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
  });
});
