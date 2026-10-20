import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CashLedgerType } from '../../generated/prisma/client.js';
import { PointCooldownType } from './accounts.constants.js';
import { AccountsService } from './accounts.service.js';
import { PointResetCondition } from './dto/res/get-point-reset-res.dto.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('AccountsService', () => {
  const account = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  };
  const cashLedger = { create: vi.fn(), findMany: vi.fn(), count: vi.fn() };
  const tx = { account, cashLedger };
  const prisma = {
    account,
    cashLedger,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;
  const service = new AccountsService(prisma);

  const accountOf = (overrides: Record<string, unknown> = {}) => ({
    id: 10,
    userId: 1,
    cash: 2_345_678n,
    lockedCash: 0n,
    version: 3n,
    lastPointGrantAt: null,
    lastPointResetAt: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    account.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('grantPoint', () => {
    it('100,000P를 더하고 지급 시각과 이력을 남긴다', async () => {
      account.findUnique.mockResolvedValue(accountOf());

      const result = await service.grantPoint(1);

      expect(result).toMatchObject({
        amount: 100_000,
        cashBefore: 2_345_678,
        cashAfter: 2_445_678,
      });
      expect(result.nextAvailableAt.getTime()).toBe(
        result.grantedAt.getTime() + DAY,
      );
      expect(account.updateMany).toHaveBeenCalledWith({
        where: { id: 10, version: 3n },
        data: {
          lastPointGrantAt: result.grantedAt,
          cash: 2_445_678n,
          version: { increment: 1 },
        },
      });
      expect(cashLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 10,
          type: CashLedgerType.GRANT,
          amount: 100_000n,
          balanceAfter: 2_445_678n,
        }),
      });
    });

    it('마지막 지급 후 24시간이 지나지 않았으면 거부하고 다음 가능 시각을 알려준다', async () => {
      const lastPointGrantAt = new Date(Date.now() - 20 * HOUR);
      account.findUnique.mockResolvedValue(accountOf({ lastPointGrantAt }));

      await expect(service.grantPoint(1)).rejects.toMatchObject({
        response: {
          code: 'POINT_GRANT_TOO_SOON',
          details: {
            nextAvailableAt: new Date(lastPointGrantAt.getTime() + DAY),
          },
        },
      });
      expect(account.updateMany).not.toHaveBeenCalled();
    });

    it('동시에 다른 요청이 계좌를 바꿨으면 지급하지 않는다', async () => {
      account.findUnique.mockResolvedValue(accountOf());
      account.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.grantPoint(1)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_CONCURRENT_UPDATE' },
      });
      expect(cashLedger.create).not.toHaveBeenCalled();
    });
  });

  describe('getPointGrantStatus', () => {
    it('24시간이 지났으면 지급 가능으로 알려준다', async () => {
      account.findUnique.mockResolvedValue(
        accountOf({ lastPointGrantAt: new Date(Date.now() - 25 * HOUR) }),
      );

      await expect(service.getPointGrantStatus(1)).resolves.toMatchObject({
        amount: 100_000,
        available: true,
        nextAvailableAt: null,
      });
    });
  });

  describe('resetPoint', () => {
    it('조건을 모두 충족하면 3,000,000P로 재설정하고 지급 대기시간은 유지한다', async () => {
      const lastPointGrantAt = new Date(Date.now() - HOUR);
      account.findUnique.mockResolvedValue(
        accountOf({ cash: 200_000n, lastPointGrantAt }),
      );

      const result = await service.resetPoint(1);

      expect(result).toMatchObject({
        cashBefore: 200_000,
        cashAfter: 3_000_000,
      });
      expect(result.nextAvailableAt.getTime()).toBe(
        result.resetAt.getTime() + 7 * DAY,
      );
      const { data } = account.updateMany.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({
        cash: 3_000_000n,
        lastPointResetAt: result.resetAt,
      });
      expect(data).not.toHaveProperty('lastPointGrantAt');
      expect(cashLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: CashLedgerType.RESET,
          amount: 2_800_000n,
          balanceAfter: 3_000_000n,
        }),
      });
    });

    it('보유 포인트가 300,000P 이상이면 사유와 함께 거부한다', async () => {
      account.findUnique.mockResolvedValue(accountOf({ cash: 300_000n }));

      await expect(service.resetPoint(1)).rejects.toMatchObject({
        response: {
          code: 'POINT_RESET_NOT_ALLOWED',
          message: '보유 포인트가 300,000P 이상이라 리셋할 수 없습니다.',
          details: { conditions: [PointResetCondition.CASH_BELOW_LIMIT] },
        },
      });
      expect(account.updateMany).not.toHaveBeenCalled();
    });

    it('예약 포인트가 있거나 7일이 지나지 않았으면 거부한다', async () => {
      account.findUnique.mockResolvedValue(
        accountOf({
          cash: 200_000n,
          lockedCash: 10_000n,
          lastPointResetAt: new Date(Date.now() - 6 * DAY),
        }),
      );

      await expect(service.resetPoint(1)).rejects.toMatchObject({
        response: {
          details: {
            conditions: [
              PointResetCondition.NO_LOCKED_CASH,
              PointResetCondition.RESET_INTERVAL_PASSED,
            ],
          },
        },
      });
    });
  });

  describe('getPointResetStatus', () => {
    it('리셋한 적이 없으면 7일 조건은 충족으로 본다', async () => {
      account.findUnique.mockResolvedValue(accountOf({ cash: 200_000n }));

      const result = await service.getPointResetStatus(1);

      expect(result.available).toBe(true);
      expect(result.nextAvailableAt).toBeNull();
      expect(result.conditions.every(({ met }) => met)).toBe(true);
    });
  });

  describe('adjustCash', () => {
    it('관리자 조정 이력을 남기고 포인트를 더한다', async () => {
      account.findUnique.mockResolvedValue(accountOf());

      await expect(service.adjustCash(1, -345_678)).resolves.toEqual({
        amount: -345_678,
        cashBefore: 2_345_678,
        cashAfter: 2_000_000,
      });
      expect(cashLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: CashLedgerType.ADJUST,
          amount: -345_678n,
        }),
      });
    });

    it('사용 가능 포인트보다 많이 차감할 수 없다', async () => {
      account.findUnique.mockResolvedValue(
        accountOf({ cash: 100_000n, lockedCash: 50_000n }),
      );

      await expect(service.adjustCash(1, -60_000)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_INSUFFICIENT_CASH' },
      });
    });
  });

  describe('clearPointCooldown', () => {
    it('지정한 대기시간만 초기화한다', async () => {
      account.findUnique.mockResolvedValue(accountOf());

      await service.clearPointCooldown(1, PointCooldownType.RESET);

      expect(account.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { lastPointResetAt: null },
      });
    });
  });

  describe('getLedgers', () => {
    it('반영 전 포인트를 계산해 최신순으로 내려준다', async () => {
      account.findUnique.mockResolvedValue(accountOf());
      cashLedger.findMany.mockResolvedValue([
        {
          id: 2n,
          type: CashLedgerType.GRANT,
          amount: 100_000n,
          balanceAfter: 3_100_000n,
          createDate: new Date(),
        },
      ]);
      cashLedger.count.mockResolvedValue(2);

      const result = await service.getLedgers(1, 1, 20);

      expect(cashLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { id: 'desc' }, skip: 0, take: 20 }),
      );
      expect(result.items[0]).toMatchObject({
        ledgerId: 2,
        balanceBefore: 3_000_000,
        balanceAfter: 3_100_000,
      });
      expect(result.totalCount).toBe(2);
    });
  });

  it('계좌가 없으면 404로 거부한다', async () => {
    account.findUnique.mockResolvedValue(null);

    await expect(service.getMyAccount(1)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_NOT_FOUND' },
    });
  });
});
