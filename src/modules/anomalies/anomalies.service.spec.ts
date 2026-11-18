import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  AnomalyAction,
  AnomalyStatus,
  AnomalyType,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { AnomaliesService } from './anomalies.service.js';
import { GetAnomaliesReqDto } from './dto/req/get-anomalies-req.dto.js';

describe('AnomaliesService', () => {
  const anomaly = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn(),
    updateMany: vi.fn(),
  };
  const tx = { anomaly };
  const prisma = {
    anomaly,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;
  const adminActivityLogs = { record: vi.fn() };
  const service = new AnomaliesService(
    prisma,
    adminActivityLogs as unknown as AdminActivityLogsService,
  );

  const DETECTED = new Date('2026-09-03T10:42:00.000Z');
  const anomalyOf = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    type: AnomalyType.ABNORMAL_PRICE,
    status: AnomalyStatus.PENDING,
    stockId: 18,
    userId: 1024,
    orderId: 9031842n,
    tradeId: 9032201n,
    errorCode: 'PRICE_DEVIATION',
    errorMessage: '가격 편차 초과',
    evidence: { basePrice: 12480, tradePrice: 18900 },
    detectedDate: DETECTED,
    action: null,
    actionReason: null,
    handledById: null,
    handledDate: null,
    stock: { name: 'SaaS Index', stockCode: 'SAAS' },
    user: { loginId: 'minhyuk01', nickname: '민혁' },
    handledBy: null,
    ...overrides,
  });
  const actor = { adminId: 1, client: { ipAddress: '192.168.10.24' } };
  const queryOf = (overrides: Partial<GetAnomaliesReqDto> = {}) =>
    Object.assign(new GetAnomaliesReqDto(), overrides);

  beforeEach(() => {
    vi.clearAllMocks();
    anomaly.findMany.mockResolvedValue([anomalyOf()]);
    anomaly.groupBy.mockResolvedValue([]);
    anomaly.findUnique.mockResolvedValue(anomalyOf());
    anomaly.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('getAnomalies', () => {
    it('최신 발생순으로 20건씩 내려주고 같은 조건으로 상단 건수를 센다', async () => {
      anomaly.groupBy.mockResolvedValue([
        {
          type: AnomalyType.ABNORMAL_PRICE,
          status: AnomalyStatus.PENDING,
          _count: { _all: 1 },
        },
        {
          type: AnomalyType.ORDER_FAILURE,
          status: AnomalyStatus.PENDING,
          _count: { _all: 2 },
        },
        {
          type: AnomalyType.ORDER_FAILURE,
          status: AnomalyStatus.RESOLVED,
          _count: { _all: 1 },
        },
      ]);

      const result = await service.getAnomalies(queryOf());

      expect(anomaly.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { detectedDate: undefined },
          orderBy: [{ detectedDate: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        items: [
          {
            anomalyId: 7,
            type: AnomalyType.ABNORMAL_PRICE,
            status: AnomalyStatus.PENDING,
            detectedDate: DETECTED,
            stockId: 18,
            stockName: 'SaaS Index',
            userId: 1024,
            loginId: 'minhyuk01',
            errorCode: 'PRICE_DEVIATION',
            errorMessage: '가격 편차 초과',
          },
        ],
        page: 1,
        size: 20,
        totalCount: 4,
        summary: {
          totalCount: 4,
          pendingCount: 3,
          typeCounts: {
            LARGE_ORDER: 0,
            REPEATED_ORDER: 0,
            ABNORMAL_PRICE: 1,
            ORDER_FAILURE: 3,
            BALANCE_MISMATCH: 0,
          },
        },
      });
    });

    it('유형·상태·발생 기간으로 거른다', async () => {
      await service.getAnomalies(
        queryOf({
          type: AnomalyType.REPEATED_ORDER,
          status: AnomalyStatus.REVIEWING,
          from: '2026-09-01T00:00:00+09:00',
          to: '2026-09-04T00:00:00+09:00',
        }),
      );

      expect(anomaly.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: AnomalyType.REPEATED_ORDER,
            status: AnomalyStatus.REVIEWING,
            detectedDate: {
              gte: new Date('2026-08-31T15:00:00.000Z'),
              lt: new Date('2026-09-03T15:00:00.000Z'),
            },
          },
        }),
      );
    });

    it.each([
      ['PRD-018', { stockId: 18 }],
      ['usr-1024', { userId: 1024 }],
      ['18', { OR: [{ stockId: 18 }, { userId: 18 }] }],
    ])('ID 검색 %s', async (keyword, expected) => {
      await service.getAnomalies(queryOf({ keyword }));

      expect(anomaly.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { detectedDate: undefined, ...expected },
        }),
      );
    });

    it.each([
      [
        '시작이 끝보다 늦음',
        '2026-09-04T00:00:00+09:00',
        '2026-09-01T00:00:00+09:00',
      ],
      ['1년 초과', '2025-01-01T00:00:00+09:00', '2026-09-01T00:00:00+09:00'],
    ])('발생 기간 오류: %s', async (_label, from, to) => {
      await expect(
        service.getAnomalies(queryOf({ from, to })),
      ).rejects.toMatchObject({ response: { code: 'ANOMALY_INVALID_PERIOD' } });
    });
  });

  describe('getAnomaly', () => {
    it('탐지 근거와 처리 결과를 포함한다', async () => {
      anomaly.findUnique.mockResolvedValue(
        anomalyOf({
          status: AnomalyStatus.RESOLVED,
          action: AnomalyAction.STOCK_PAUSE,
          actionReason: '가격 급등 원인 확인',
          handledById: 1,
          handledDate: DETECTED,
          handledBy: { loginId: 'admin01' },
        }),
      );

      await expect(service.getAnomaly(7)).resolves.toEqual(
        expect.objectContaining({
          stockCode: 'SAAS',
          nickname: '민혁',
          orderId: 9031842,
          tradeId: 9032201,
          evidence: { basePrice: 12480, tradePrice: 18900 },
          action: AnomalyAction.STOCK_PAUSE,
          actionReason: '가격 급등 원인 확인',
          handledBy: { adminId: 1, loginId: 'admin01' },
          handledDate: DETECTED,
        }),
      );
      // 조회만으로 상태를 바꾸지 않는다.
      expect(anomaly.updateMany).not.toHaveBeenCalled();
    });

    it('상품이 없는 이상 거래는 상품 값이 null이다', async () => {
      anomaly.findUnique.mockResolvedValue(
        anomalyOf({ stockId: null, stock: null, orderId: null, tradeId: null }),
      );

      await expect(service.getAnomaly(7)).resolves.toEqual(
        expect.objectContaining({
          stockId: null,
          stockName: null,
          stockCode: null,
          orderId: null,
          tradeId: null,
        }),
      );
    });

    it('없으면 404', async () => {
      anomaly.findUnique.mockResolvedValue(null);

      await expect(service.getAnomaly(999)).rejects.toMatchObject({
        response: { code: 'ANOMALY_NOT_FOUND' },
      });
    });
  });

  describe('review', () => {
    it('넘어갈 조치를 남기고 확인중으로 바꾼다', async () => {
      await service.review(7, AnomalyAction.STOCK_PAUSE, 1);

      expect(anomaly.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: { not: AnomalyStatus.RESOLVED } },
        data: {
          status: AnomalyStatus.REVIEWING,
          action: AnomalyAction.STOCK_PAUSE,
          handledById: 1,
          handledDate: expect.any(Date),
        },
      });
      expect(adminActivityLogs.record).not.toHaveBeenCalled();
    });

    it('상품이 없는 이상 거래는 거래 중지로 넘어갈 수 없다', async () => {
      anomaly.findUnique.mockResolvedValue(anomalyOf({ stockId: null }));

      await expect(
        service.review(7, AnomalyAction.STOCK_PAUSE, 1),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_TARGET_MISMATCH' },
      });
    });

    it('이미 처리완료면 409', async () => {
      anomaly.findUnique.mockResolvedValue(
        anomalyOf({ status: AnomalyStatus.RESOLVED }),
      );

      await expect(
        service.review(7, AnomalyAction.USER_BLOCK, 1),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_ALREADY_RESOLVED' },
      });
    });

    it('그사이 다른 관리자가 처리완료했으면 409', async () => {
      anomaly.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.review(7, AnomalyAction.USER_BLOCK, 1),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_ALREADY_RESOLVED' },
      });
    });
  });

  describe('dismiss', () => {
    it('이상 없음으로 처리완료하고 활동 이력을 같은 트랜잭션에 남긴다', async () => {
      await service.dismiss(7, '정상 체결로 확인', actor);

      expect(anomaly.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: { not: AnomalyStatus.RESOLVED } },
        data: {
          status: AnomalyStatus.RESOLVED,
          action: AnomalyAction.NO_ISSUE,
          actionReason: '정상 체결로 확인',
          handledById: 1,
          handledDate: expect.any(Date),
        },
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        {
          adminId: 1,
          targetType: AdminActivityTarget.ANOMALY,
          targetId: 7,
          targetLabel: '비정상 가격 체결',
          action: AdminActivityAction.ANOMALY_ACTION,
          summary: '미처리 → 처리완료 (이상 없음)',
          before: { status: AnomalyStatus.PENDING, action: null },
          after: {
            status: AnomalyStatus.RESOLVED,
            action: AnomalyAction.NO_ISSUE,
          },
          reason: '정상 체결로 확인',
          client: { ipAddress: '192.168.10.24' },
        },
        tx,
      );
    });

    it('그사이 처리완료됐으면 409이고 이력을 남기지 않는다', async () => {
      anomaly.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.dismiss(7, '정상 체결로 확인', actor),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_ALREADY_RESOLVED' },
      });
      expect(adminActivityLogs.record).not.toHaveBeenCalled();
    });
  });

  describe('assertActionable', () => {
    it('거래 중지는 그 이상 거래의 상품이어야 한다', async () => {
      await expect(
        service.assertActionable(7, {
          action: AnomalyAction.STOCK_PAUSE,
          stockId: 18,
        }),
      ).resolves.toMatchObject({ id: 7 });
      await expect(
        service.assertActionable(7, {
          action: AnomalyAction.STOCK_PAUSE,
          stockId: 6,
        }),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_TARGET_MISMATCH' },
      });
    });

    it('회원 정지는 그 이상 거래의 회원이어야 한다', async () => {
      await expect(
        service.assertActionable(7, {
          action: AnomalyAction.USER_BLOCK,
          userId: 99,
          userStatus: UserStatus.BLOCKED,
        }),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_TARGET_MISMATCH' },
      });
    });

    it('회원 상태를 정지가 아닌 값으로 바꾸면서는 처리할 수 없다', async () => {
      await expect(
        service.assertActionable(7, {
          action: AnomalyAction.USER_BLOCK,
          userId: 1024,
          userStatus: UserStatus.ACTIVE,
        }),
      ).rejects.toMatchObject({ response: { code: 'ANOMALY_INVALID_ACTION' } });
      expect(anomaly.findUnique).not.toHaveBeenCalled();
    });

    it('이미 처리완료면 409', async () => {
      anomaly.findUnique.mockResolvedValue(
        anomalyOf({ status: AnomalyStatus.RESOLVED }),
      );

      await expect(
        service.assertActionable(7, {
          action: AnomalyAction.STOCK_PAUSE,
          stockId: 18,
        }),
      ).rejects.toMatchObject({
        response: { code: 'ANOMALY_ALREADY_RESOLVED' },
      });
    });
  });
});
