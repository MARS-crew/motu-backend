import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AdminActivityAction,
  AdminActivityResult,
  AdminActivityTarget,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from './admin-activity-logs.service.js';
import { GetAdminActivityLogsReqDto } from './dto/req/get-admin-activity-logs-req.dto.js';

describe('AdminActivityLogsService', () => {
  const adminActivityLog = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  };
  const prisma = {
    adminActivityLog,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const service = new AdminActivityLogsService(prisma);

  const logOf = (overrides: Record<string, unknown> = {}) => ({
    id: 31n,
    adminId: 1,
    targetType: AdminActivityTarget.STOCK,
    targetId: 18n,
    targetLabel: 'SaaS Index',
    action: AdminActivityAction.STOCK_PAUSE,
    result: AdminActivityResult.SUCCESS,
    summary: '거래 가능 → 거래 중지',
    beforeValue: { tradeStatus: 'ACTIVE' },
    afterValue: { tradeStatus: 'PAUSED' },
    reason: '가격 데이터 점검',
    ipAddress: '192.168.10.24',
    userAgent: 'Mozilla/5.0',
    createDate: new Date('2026-09-03T11:10:00Z'),
    admin: { loginId: 'admin01' },
    ...overrides,
  });

  const queryOf = (overrides: Partial<GetAdminActivityLogsReqDto> = {}) =>
    Object.assign(new GetAdminActivityLogsReqDto(), overrides);

  beforeEach(() => {
    vi.clearAllMocks();
    adminActivityLog.findMany.mockResolvedValue([logOf()]);
    adminActivityLog.count.mockResolvedValue(1);
  });

  describe('record', () => {
    it('넘겨받은 트랜잭션으로 이력을 남긴다', async () => {
      const tx = { adminActivityLog: { create: vi.fn() } };

      await service.record(
        {
          adminId: 1,
          targetType: AdminActivityTarget.STOCK,
          targetId: 18,
          targetLabel: 'SaaS Index',
          action: AdminActivityAction.STOCK_PAUSE,
          summary: '거래 가능 → 거래 중지',
          before: { tradeStatus: 'ACTIVE' },
          after: { tradeStatus: 'PAUSED' },
          reason: '가격 데이터 점검',
          client: { ipAddress: '192.168.10.24', userAgent: 'Mozilla/5.0' },
        },
        tx as never,
      );

      expect(tx.adminActivityLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 1,
          targetType: AdminActivityTarget.STOCK,
          targetId: 18n,
          targetLabel: 'SaaS Index',
          action: AdminActivityAction.STOCK_PAUSE,
          result: undefined,
          summary: '거래 가능 → 거래 중지',
          beforeValue: { tradeStatus: 'ACTIVE' },
          afterValue: { tradeStatus: 'PAUSED' },
          reason: '가격 데이터 점검',
          ipAddress: '192.168.10.24',
          userAgent: 'Mozilla/5.0',
        },
      });
      expect(adminActivityLog.create).not.toHaveBeenCalled();
    });

    it('대상에서 할 수 없는 작업은 기록하지 않는다', async () => {
      await expect(
        service.record({
          adminId: 1,
          targetType: AdminActivityTarget.USER,
          targetId: 5,
          action: AdminActivityAction.STOCK_PAUSE,
        }),
      ).rejects.toThrow('USER에서 STOCK_PAUSE을 기록할 수 없습니다.');
      expect(adminActivityLog.create).not.toHaveBeenCalled();
    });

    it('컬럼 길이를 넘는 값은 잘라서 남긴다', async () => {
      await service.record({
        adminId: 1,
        targetType: AdminActivityTarget.NOTICE,
        targetId: 3,
        targetLabel: '가'.repeat(150),
        action: AdminActivityAction.NOTICE_PUBLISH,
        reason: '나'.repeat(600),
      });

      const { data } = adminActivityLog.create.mock.calls[0][0];
      expect(data.targetLabel).toHaveLength(100);
      expect(data.reason).toHaveLength(500);
    });
  });

  describe('getLogs', () => {
    it('조건을 모아 최신순으로 조회한다', async () => {
      const result = await service.getLogs(
        queryOf({
          adminLoginId: 'admin',
          targetType: AdminActivityTarget.STOCK,
          targetId: 18,
          action: AdminActivityAction.STOCK_PAUSE,
          from: '2026-09-01T00:00:00+09:00',
          to: '2026-09-04T00:00:00+09:00',
          page: 2,
          size: 10,
        }),
      );

      expect(adminActivityLog.findMany).toHaveBeenCalledWith({
        where: {
          admin: { loginId: { contains: 'admin' } },
          targetType: AdminActivityTarget.STOCK,
          targetId: 18n,
          action: AdminActivityAction.STOCK_PAUSE,
          createDate: {
            gte: new Date('2026-08-31T15:00:00Z'),
            lt: new Date('2026-09-03T15:00:00Z'),
          },
        },
        include: { admin: { select: { loginId: true } } },
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({
        items: [
          {
            activityLogId: 31,
            createDate: new Date('2026-09-03T11:10:00Z'),
            adminId: 1,
            adminLoginId: 'admin01',
            targetType: AdminActivityTarget.STOCK,
            targetId: 18,
            targetLabel: 'SaaS Index',
            action: AdminActivityAction.STOCK_PAUSE,
            result: AdminActivityResult.SUCCESS,
            summary: '거래 가능 → 거래 중지',
          },
        ],
        page: 2,
        size: 10,
        totalCount: 1,
      });
    });

    it('조건이 없으면 전체를 조회한다', async () => {
      await service.getLogs(queryOf());

      expect(adminActivityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            admin: undefined,
            targetType: undefined,
            targetId: undefined,
            action: undefined,
            createDate: undefined,
          },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('시작만 보내면 그 이후를 조회한다', async () => {
      await service.getLogs(queryOf({ from: '2026-09-01T00:00:00Z' }));

      expect(
        adminActivityLog.findMany.mock.calls[0][0].where.createDate,
      ).toEqual({ gte: new Date('2026-09-01T00:00:00Z'), lt: undefined });
    });

    it('작업 대상에서 할 수 없는 수행 작업이면 400', async () => {
      await expect(
        service.getLogs(
          queryOf({
            targetType: AdminActivityTarget.NOTICE,
            action: AdminActivityAction.POINT_GRANT,
          }),
        ),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_ACTIVITY_LOG_ACTION_TARGET_MISMATCH' },
      });
    });

    it('수행 작업만 보내는 것은 허용한다', async () => {
      await service.getLogs(
        queryOf({ action: AdminActivityAction.POINT_GRANT }),
      );

      expect(adminActivityLog.findMany).toHaveBeenCalled();
    });

    it('대상 ID만 보내면 400', async () => {
      await expect(
        service.getLogs(queryOf({ targetId: 18 })),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_ACTIVITY_LOG_TARGET_TYPE_REQUIRED' },
      });
    });

    it.each([
      ['시작과 종료가 같으면', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'],
      [
        '시작이 종료보다 늦으면',
        '2026-09-02T00:00:00Z',
        '2026-09-01T00:00:00Z',
      ],
      ['366일을 넘으면', '2025-01-01T00:00:00Z', '2026-01-03T00:00:00Z'],
    ])('%s 400', async (_name, from, to) => {
      await expect(
        service.getLogs(queryOf({ from, to })),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_ACTIVITY_LOG_INVALID_PERIOD' },
      });
    });
  });

  describe('getLog', () => {
    it('변경 전·후 값과 가린 IP를 내려준다', async () => {
      adminActivityLog.findUnique.mockResolvedValue(logOf());

      await expect(service.getLog(31)).resolves.toMatchObject({
        activityLogId: 31,
        adminLoginId: 'admin01',
        before: { tradeStatus: 'ACTIVE' },
        after: { tradeStatus: 'PAUSED' },
        reason: '가격 데이터 점검',
        ipAddress: '192.168.***.***',
      });
      expect(adminActivityLog.findUnique).toHaveBeenCalledWith({
        where: { id: 31n },
        include: { admin: { select: { loginId: true } } },
      });
    });

    it('값이 없으면 null로 내려준다', async () => {
      adminActivityLog.findUnique.mockResolvedValue(
        logOf({
          beforeValue: null,
          afterValue: null,
          reason: null,
          ipAddress: null,
        }),
      );

      await expect(service.getLog(31)).resolves.toMatchObject({
        before: null,
        after: null,
        reason: null,
        ipAddress: null,
      });
    });

    it('없는 이력이면 404', async () => {
      adminActivityLog.findUnique.mockResolvedValue(null);

      await expect(service.getLog(999)).rejects.toMatchObject({
        response: { code: 'ADMIN_ACTIVITY_LOG_NOT_FOUND' },
      });
    });
  });
});
