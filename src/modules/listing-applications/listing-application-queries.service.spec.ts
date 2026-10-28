import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { FilesService } from '../files/files.service.js';
import type { ListingStepValidationService } from './listing-step-validation.service.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';

describe('단계 저장 및 신청 조회', () => {
  const now = new Date('2026-10-25T00:00:00Z');
  const model = {
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
  };
  const tx = { $queryRaw: vi.fn(), listingApplication: model };
  const prisma = {
    $transaction: vi.fn(async (action: (arg: typeof tx) => Promise<unknown>) =>
      action(tx),
    ),
  };
  const steps = { validate: vi.fn(), getAttachments: vi.fn() };
  const service = new ListingApplicationsService(
    prisma as unknown as PrismaService,
    {} as FilesService,
    steps as unknown as ListingStepValidationService,
  );
  const record = () => ({
    id: 1,
    userId: 1,
    status: 'DRAFT',
    serviceName: null,
    draftData: { summary: '이전 소개' },
    currentStep: 1,
    applicationNumber: null,
    submittedAt: null,
    reviewComment: null,
    revisionDeadline: null,
    lastSavedAt: now,
    expiresAt: new Date('2027-01-23T00:00:00Z'),
    createDate: now,
    modifiedDate: now,
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    prisma.$transaction.mockImplementation(async (action) => action(tx));
    tx.$queryRaw.mockResolvedValue([{ user_id: 1 }]);
    model.findFirst.mockResolvedValue(record());
    model.findUniqueOrThrow.mockResolvedValue(record());
    model.updateMany.mockResolvedValue({ count: 1 });
    steps.validate.mockResolvedValue([]);
    steps.getAttachments.mockResolvedValue({
      logo: null,
      mainImage: null,
      evidence: null,
    });
  });
  afterEach(() => vi.useRealTimers());
  it('단계 저장 시 같은 트랜잭션에서 검증하고 다른 단계 입력을 유지한다', async () => {
    const result = await service.saveStep(1, 1, 2, {
      data: { desiredPrice: '10000' },
    });
    expect(steps.validate).toHaveBeenCalledWith(
      1,
      2,
      { summary: '이전 소개', desiredPrice: '10000' },
      now,
      tx,
    );
    expect(result.validatedStep).toBe(2);
    expect(model.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          draftData: { summary: '이전 소개', desiredPrice: '10000' },
          currentStep: 2,
        }),
      }),
    );
    expect(model.updateMany.mock.calls.at(-1)?.[0].data).not.toHaveProperty(
      'status',
    );
    expect(model.updateMany.mock.calls.at(-1)?.[0].data).not.toHaveProperty(
      'applicationNumber',
    );
  });
  it('검증 실패 시 저장을 실행하지 않는다', async () => {
    steps.validate.mockResolvedValue([
      { field: 'desiredPrice', message: '희망 상장가를 입력해 주세요.' },
    ]);
    await expect(service.saveStep(1, 1, 2, { data: {} })).rejects.toMatchObject(
      { error: { code: 'LISTING_STEP_VALIDATION_FAILED' } },
    );
    expect(model.updateMany).toHaveBeenCalledTimes(1);
    expect(model.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('DTO 변환이 생성한 undefined 필드를 다른 단계 입력으로 간주하지 않는다', async () => {
    const data = Object.assign(new ListingDraftDataReqDto(), {
      desiredPrice: '10000',
    });
    await expect(service.saveStep(1, 1, 2, { data })).resolves.toMatchObject({
      validatedStep: 2,
    });
    expect(steps.validate).toHaveBeenCalledWith(
      1,
      2,
      { summary: '이전 소개', desiredPrice: '10000' },
      now,
      tx,
    );
  });
  it('다른 단계 필드와 잘못된 단계는 트랜잭션 전에 거부한다', () => {
    expect(() =>
      service.saveStep(1, 1, 2, { data: { serviceName: '잘못된 단계' } }),
    ).toThrow();
    expect(() => service.saveStep(1, 1, 5, { data: {} })).toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    'SUBMITTED',
    'UNDER_REVIEW',
    'REVISION_REQUESTED',
    'APPROVED',
    'REJECTED',
  ])(
    '%s 상세는 실제 저장값을 반환하고 임시저장 만료를 적용하지 않는다',
    async (status) => {
      model.findFirst.mockResolvedValue({
        ...record(),
        status,
        applicationNumber: 'LST-261025-001',
        submittedAt: now,
        reviewComment: '실제 의견',
        revisionDeadline: new Date('2026-11-01T00:00:00Z'),
        expiresAt: new Date('2026-10-24T00:00:00Z'),
      });
      const result = await service.getApplication(1, 1);
      expect(result).toMatchObject({
        status,
        applicationNumber: 'LST-261025-001',
        submittedAt: now,
        reviewComment: '실제 의견',
        expiresAt: null,
        isEditable: false,
      });
      expect(result.data).toEqual({ summary: '이전 소개' });
      expect(model.updateMany).toHaveBeenCalledTimes(1);
    },
  );
  it('상태 조회는 만료를 보여 주고 상세는 만료 오류를 반환한다', async () => {
    model.findFirst.mockResolvedValue({ ...record(), expiresAt: now });
    expect(await service.getApplicationStatus(1, 1)).toMatchObject({
      status: 'EXPIRED',
      statusLabel: '만료',
      isEditable: false,
    });
    await expect(service.getApplication(1, 1)).rejects.toMatchObject({
      error: { code: 'LISTING_DRAFT_EXPIRED' },
    });
  });
  it('본인이 아닌 신청서의 상세·상태는 모두 404다', async () => {
    model.findFirst.mockResolvedValue(null);
    await expect(service.getApplication(2, 1)).rejects.toMatchObject({
      error: { code: 'LISTING_APPLICATION_NOT_FOUND' },
    });
    await expect(service.getApplicationStatus(2, 1)).rejects.toMatchObject({
      error: { code: 'LISTING_APPLICATION_NOT_FOUND' },
    });
    expect(steps.getAttachments).not.toHaveBeenCalled();
  });
  it('임시저장 상태 조회는 접수일이나 관리자 의견을 만들지 않는다', async () => {
    expect(await service.getApplicationStatus(1, 1)).toMatchObject({
      status: 'DRAFT',
      statusLabel: '임시 저장',
      submittedAt: null,
      reviewComment: null,
      revisionDeadline: null,
      isEditable: true,
    });
    expect(model.updateMany).toHaveBeenCalledTimes(1);
  });
});
