import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { FilesService } from '../files/files.service.js';
import { ListingRevisionsService } from './listing-revisions.service.js';

describe('상장 신청 보완 요청·재제출', () => {
  const now = new Date('2026-10-26T09:00:00Z');
  const deadline = new Date('2026-11-02T14:59:59.999Z');
  const appModel = {
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const revisionModel = {
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const tx = {
    $queryRaw: vi.fn(),
    listingApplication: appModel,
    listingApplicationRevision: revisionModel,
  };
  const prisma = { $transaction: vi.fn() };
  const files = { getSavedCollection: vi.fn(), freezeSavedCollection: vi.fn() };
  const service = new ListingRevisionsService(
    prisma as unknown as PrismaService,
    files as unknown as FilesService,
  );
  const app = () => ({
    id: 1,
    userId: 2,
    applicationNumber: 'LST-261025-001',
    submittedAt: new Date('2026-10-25T00:00:00Z'),
    status: 'UNDER_REVIEW',
    draftData: { serviceName: '기존 서비스', desiredPrice: '10000' },
    deletedDate: null,
  });
  const revision = () => ({
    id: 3,
    applicationId: 1,
    requestContent: '거래액 근거를 보완해 주세요.',
    deadline,
    deadlineHistory: [],
    resubmittedAt: null,
    evidenceCollectionId: null,
    evidenceSnapshot: null,
    createDate: now,
  });
  const evidence = () => ({
    id: 'collection',
    purpose: 'EVIDENCE',
    description: '집계 근거 자료를 보완했습니다.',
    attachments: [
      {
        id: 'file',
        kind: 'LINK',
        url: 'https://example.com/evidence',
        saved: true,
      },
    ],
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.$transaction.mockImplementation(
      (action: (client: typeof tx) => Promise<unknown>) => action(tx),
    );
    tx.$queryRaw.mockResolvedValue([{ application_id: 1 }]);
    appModel.findUniqueOrThrow.mockResolvedValue(app());
    appModel.findFirst.mockResolvedValue(app());
    appModel.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...app(), ...data }),
    );
    revisionModel.count.mockResolvedValue(0);
    revisionModel.findFirst.mockResolvedValue(revision());
    revisionModel.findMany.mockResolvedValue([revision()]);
    revisionModel.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...revision(), ...data }),
    );
    files.getSavedCollection.mockResolvedValue(evidence());
    files.freezeSavedCollection.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());
  const pending = () => {
    appModel.findUniqueOrThrow.mockResolvedValue({
      ...app(),
      status: 'REVISION_REQUESTED',
    });
    appModel.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...app(), status: 'REVISION_REQUESTED', ...data }),
    );
  };

  it('본인 요청만 조회하고 기한 경과 표시를 계산한다', async () => {
    appModel.findFirst.mockResolvedValue({
      ...app(),
      status: 'REVISION_REQUESTED',
    });
    revisionModel.findMany.mockResolvedValue([
      { ...revision(), deadline: now },
    ]);
    const result = await service.list(1, 1, 10, 2);
    expect(appModel.findFirst).toHaveBeenCalledWith({
      where: { id: 1, deletedDate: null, userId: 2 },
    });
    expect(result.items[0]).toMatchObject({
      isDeadlinePassed: true,
      canResubmit: false,
    });
  });
  it('타인의 요청 조회는 404다', async () => {
    appModel.findFirst.mockResolvedValue(null);
    await expect(service.list(1, 1, 10, 7)).rejects.toMatchObject({
      error: { code: 'LISTING_REVISION_NOT_FOUND' },
    });
  });
  it('소유자 ID 생략으로 조회 범위를 넓힐 수 없다', () => {
    expect(() =>
      service.list(1, 1, 10, undefined as unknown as number),
    ).toThrow();
    expect(appModel.findFirst).not.toHaveBeenCalled();
  });
  it('접수 정보가 없는 신청서는 재제출 가능으로 표시하지 않는다', async () => {
    appModel.findFirst.mockResolvedValue({
      ...app(),
      status: 'REVISION_REQUESTED',
      applicationNumber: null,
      submittedAt: null,
    });
    const result = await service.list(1, 1, 10, 2);
    expect(result.items[0].canResubmit).toBe(false);
  });
  it('정상 재제출은 증빙을 동결하고 번호·접수일을 변경하지 않는다', async () => {
    pending();
    const result = await service.resubmit(2, 1, 3, 'collection');
    expect(result.status).toBe('UNDER_REVIEW');
    expect(result.applicationNumber).toBe(app().applicationNumber);
    expect(files.getSavedCollection).toHaveBeenCalledWith(2, 'collection', tx);
    expect(files.freezeSavedCollection).toHaveBeenCalledWith(
      2,
      'collection',
      tx,
    );
    expect(revisionModel.update.mock.calls[0][0].data.evidenceSnapshot).toEqual(
      evidence(),
    );
    const update = appModel.update.mock.calls[0][0].data;
    expect(update).toMatchObject({
      revisionDeadline: null,
      draftData: {
        serviceName: '기존 서비스',
        desiredPrice: '10000',
        evidenceCollectionId: 'collection',
      },
    });
    expect(update).not.toHaveProperty('submittedAt');
    expect(update).not.toHaveProperty('applicationNumber');
  });
  it('타인 재제출은 행 잠금 소유자 조건으로 거절한다', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.resubmit(7, 1, 3, 'collection')).rejects.toMatchObject(
      { error: { code: 'LISTING_REVISION_NOT_FOUND' } },
    );
    expect(files.getSavedCollection).not.toHaveBeenCalled();
  });
  it.each([
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'EXPIRED',
  ])('%s 상태의 미제출 회차는 재제출할 수 없다', async (status) => {
    appModel.findUniqueOrThrow.mockResolvedValue({ ...app(), status });
    await expect(service.resubmit(2, 1, 3, 'collection')).rejects.toMatchObject(
      { error: { code: 'LISTING_REVISION_INVALID_STATE' } },
    );
    expect(files.getSavedCollection).not.toHaveBeenCalled();
  });
  it('접수 정보가 없는 신청서를 재제출로 접수시킬 수 없다', async () => {
    appModel.findUniqueOrThrow.mockResolvedValue({
      ...app(),
      status: 'REVISION_REQUESTED',
      applicationNumber: null,
      submittedAt: null,
    });
    await expect(service.resubmit(2, 1, 3, 'collection')).rejects.toMatchObject(
      { error: { code: 'LISTING_REVISION_INVALID_STATE' } },
    );
  });
  it('기한과 정확히 같은 시각부터 재제출을 차단하고 상태를 유지한다', async () => {
    pending();
    revisionModel.findFirst.mockResolvedValue({ ...revision(), deadline: now });
    await expect(service.resubmit(2, 1, 3, 'collection')).rejects.toMatchObject(
      { error: { code: 'LISTING_REVISION_DEADLINE_PASSED' } },
    );
    expect(appModel.update).not.toHaveBeenCalled();
    expect(files.freezeSavedCollection).not.toHaveBeenCalled();
  });
  it('파일 잠금 대기 중 기한이 지나면 롤백한다', async () => {
    pending();
    files.getSavedCollection.mockImplementation(() => {
      vi.setSystemTime(deadline);
      return Promise.resolve(evidence());
    });
    await expect(service.resubmit(2, 1, 3, 'collection')).rejects.toMatchObject(
      { error: { code: 'LISTING_REVISION_DEADLINE_PASSED' } },
    );
    expect(revisionModel.update).not.toHaveBeenCalled();
  });
  it.each([
    { purpose: 'MAIN_IMAGE' },
    { attachments: [] },
    { description: '짧음' },
    { description: null },
  ])(
    '증빙 요건 미충족 시 상태·동결·이력을 반영하지 않는다 (%j)',
    async (patch) => {
      pending();
      files.getSavedCollection.mockResolvedValue({ ...evidence(), ...patch });
      await expect(
        service.resubmit(2, 1, 3, 'collection'),
      ).rejects.toMatchObject({
        error: { code: 'LISTING_REVISION_INVALID_EVIDENCE' },
      });
      expect(files.freezeSavedCollection).not.toHaveBeenCalled();
      expect(appModel.update).not.toHaveBeenCalled();
    },
  );
  it('같은 요청·묶음의 재전송은 이전 성공을 반환한다', async () => {
    revisionModel.findFirst.mockResolvedValue({
      ...revision(),
      resubmittedAt: now,
      evidenceCollectionId: 'collection',
      evidenceSnapshot: evidence(),
    });
    const result = await service.resubmit(2, 1, 3, 'collection');
    expect(result.revision.resubmittedAt).toEqual(now);
    expect(files.getSavedCollection).not.toHaveBeenCalled();
    expect(appModel.update).not.toHaveBeenCalled();
  });
  it('이미 제출한 회차에 다른 묶음을 보내면 거절한다', async () => {
    revisionModel.findFirst.mockResolvedValue({
      ...revision(),
      resubmittedAt: now,
      evidenceCollectionId: 'old',
    });
    await expect(service.resubmit(2, 1, 3, 'new')).rejects.toMatchObject({
      error: { code: 'LISTING_REVISION_ALREADY_SUBMITTED' },
    });
  });
});
