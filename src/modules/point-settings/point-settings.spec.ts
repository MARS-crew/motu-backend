import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { UpdateInitialGrantReqDto } from './dto/req/update-initial-grant-req.dto.js';
import { GetInitialGrantHistoryReqDto } from './dto/req/get-initial-grant-history-req.dto.js';
import { PointSettingsService } from './point-settings.service.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const valid = {
  amount: 5_000_000,
  expectedVersion: 1,
  reason: '  가입 지급 정책 변경  ',
};
const transform = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: UpdateInitialGrantReqDto });

describe('초기 지급 설정 입력', () => {
  it.each([1, 3_000_000, Number.MAX_SAFE_INTEGER])(
    '양의 안전한 정수 %s 허용·사유 trim',
    async (amount) => {
      expect(await transform({ ...valid, amount })).toMatchObject({
        amount,
        reason: '가입 지급 정책 변경',
      });
    },
  );
  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    '5000000',
    true,
    null,
    [],
    {},
    undefined,
  ])('잘못된 금액 %j 거절', async (amount) => {
    await expect(transform({ ...valid, amount })).rejects.toMatchObject({
      status: 400,
    });
  });
  it.each([0, -1, 1.5, '1', null, undefined, 2_147_483_647])(
    '잘못된 버전 %j 거절',
    async (expectedVersion) => {
      await expect(
        transform({ ...valid, expectedVersion }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it.each(['', '   ', '가'.repeat(201), 1, null, undefined])(
    '잘못된 사유 거절',
    async (reason) => {
      await expect(transform({ ...valid, reason })).rejects.toMatchObject({
        status: 400,
      });
    },
  );
  it('200자 사유 허용', async () => {
    await expect(
      transform({ ...valid, reason: '가'.repeat(200) }),
    ).resolves.toBeDefined();
  });
  it.each([{}, [], null, { ...valid, userId: 2 }])(
    '누락·잘못된 본문·추가 필드 거절',
    async (body) => {
      await expect(transform(body)).rejects.toMatchObject({ status: 400 });
    },
  );
  it('이력 기본 페이지와 최대 페이지 크기 검증', async () => {
    expect(
      await pipe.transform(
        {},
        { type: 'query', metatype: GetInitialGrantHistoryReqDto },
      ),
    ).toEqual({ page: 1, size: 20 });
    await expect(
      pipe.transform(
        { size: '101' },
        { type: 'query', metatype: GetInitialGrantHistoryReqDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('PointSettingsService', () => {
  const before = {
    id: 1,
    amount: 3_000_000n,
    version: 1,
    modifiedDate: new Date(),
  };
  const setting = { findUniqueOrThrow: vi.fn(), update: vi.fn() };
  const tx = { initialPointSetting: setting, $queryRaw: vi.fn() };
  const prisma = {
    initialPointSetting: setting,
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const activities = { record: vi.fn() };
  const service = new PointSettingsService(
    prisma as unknown as PrismaService,
    activities as unknown as AdminActivityLogsService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    setting.findUniqueOrThrow.mockResolvedValue(before);
    setting.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...before, ...data, version: 2 }),
    );
    tx.$queryRaw.mockResolvedValue([{ amount: before.amount }]);
    activities.record.mockResolvedValue(undefined);
  });
  it('조회는 기본값을 다시 쓰지 않는다', async () => {
    expect(await service.getInitialGrant()).toEqual({
      amount: 3_000_000,
      version: 1,
      modifiedDate: before.modifiedDate,
    });
    expect(setting.update).not.toHaveBeenCalled();
  });
  it('오래된 버전이면 설정과 이력 변경 거절', async () => {
    await expect(
      service.updateInitialGrant(
        { ...valid, expectedVersion: 2 },
        { adminId: 9 },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'POINT_SETTINGS_CONCURRENT_UPDATE' },
    });
    expect(setting.update).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });
  it('같은 금액이면 버전·이력을 늘리지 않는다', async () => {
    expect(
      (
        await service.updateInitialGrant(
          { ...valid, amount: 3_000_000 },
          { adminId: 9 },
        )
      ).version,
    ).toBe(1);
    expect(setting.update).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });
  it('금액·버전과 별도의 설정 변경 이력을 같은 트랜잭션에 저장', async () => {
    const result = await service.updateInitialGrant(
      { ...valid, reason: '정책 변경' },
      { adminId: 9 },
    );
    expect(result).toMatchObject({ amount: 5_000_000, version: 2 });
    expect(activities.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 9,
        targetType: 'POINT_SETTING',
        targetId: 1,
        action: 'INITIAL_GRANT_UPDATE',
        before: { amount: 3_000_000, version: 1 },
        after: { amount: 5_000_000, version: 2 },
        reason: '정책 변경',
      }),
      tx,
    );
  });
  it('이력 저장 실패를 숨기지 않고 트랜잭션을 실패시킨다', async () => {
    activities.record.mockRejectedValueOnce(new Error('이력 저장 실패'));
    await expect(
      service.updateInitialGrant(valid, { adminId: 9 }),
    ).rejects.toThrow('이력 저장 실패');
  });
  it('가입에 전달된 트랜잭션에서 공유 잠금으로 금액을 읽는다', async () => {
    expect(
      await service.getSignupGrant(tx as unknown as Prisma.TransactionClient),
    ).toBe(3_000_000n);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR SHARE');
  });
  it('설정 행이 없으면 임의 기본값으로 가입시키지 않는다', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      service.getSignupGrant(tx as unknown as Prisma.TransactionClient),
    ).rejects.toThrow('마이그레이션');
  });
});
