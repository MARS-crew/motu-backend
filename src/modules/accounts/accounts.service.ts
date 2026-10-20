import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Account,
  CashLedgerType,
  PointResetCondition,
  PointResetResult,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  INITIAL_CASH,
  POINT_GRANT_AMOUNT,
  POINT_GRANT_INTERVAL_MS,
  POINT_RESET_INTERVAL_MS,
  POINT_RESET_MAX_CASH,
  PointCooldownType,
} from './accounts.constants.js';
import { AccountErrors } from './accounts.errors.js';
import { AdjustCashResDto } from './dto/res/adjust-cash-res.dto.js';
import { GetAccountResDto } from './dto/res/get-account-res.dto.js';
import { GetLedgersResDto } from './dto/res/get-ledgers-res.dto.js';
import { GetMyAccountResDto } from './dto/res/get-my-account-res.dto.js';
import { GetPointGrantResDto } from './dto/res/get-point-grant-res.dto.js';
import { GetPointResetResDto } from './dto/res/get-point-reset-res.dto.js';
import { GrantPointResDto } from './dto/res/grant-point-res.dto.js';
import { ResetPointResDto } from './dto/res/reset-point-res.dto.js';

const formatPoint = (point: bigint) => `${point.toLocaleString('ko-KR')}P`;

interface CheckedResetCondition {
  condition: PointResetCondition;
  met: boolean;
  /** 충족하지 못했을 때 보여줄 리셋 불가 사유 */
  reason: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 계좌를 만들고 초기 포인트를 지급한다. 회원가입과 같은 트랜잭션에서 호출한다.
   */
  createInitialAccount(
    tx: Prisma.TransactionClient,
    userId: number,
  ): Promise<Account> {
    return tx.account.create({
      data: {
        userId,
        cash: INITIAL_CASH,
        ledgers: {
          create: {
            type: CashLedgerType.DEPOSIT,
            amount: INITIAL_CASH,
            balanceAfter: INITIAL_CASH,
          },
        },
      },
    });
  }

  async getMyAccount(userId: number): Promise<GetMyAccountResDto> {
    return this.toAccountRes(await this.findAccount(userId));
  }

  /** 관리자용. 마지막 지급·리셋 시각까지 함께 내려준다. */
  async getAccount(userId: number): Promise<GetAccountResDto> {
    const account = await this.findAccount(userId);
    const { cash, lockedCash, availableCash } = this.toAccountRes(account);
    return {
      userId: account.userId,
      cash,
      lockedCash,
      availableCash,
      lastPointGrantAt: account.lastPointGrantAt,
      lastPointResetAt: account.lastPointResetAt,
    };
  }

  /** 포인트 변경 이력을 최신순으로 조회한다. */
  async getLedgers(
    userId: number,
    page: number,
    size: number,
  ): Promise<GetLedgersResDto> {
    const account = await this.findAccount(userId);
    const where = { accountId: account.id };
    const [ledgers, totalCount] = await this.prisma.$transaction([
      this.prisma.cashLedger.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.cashLedger.count({ where }),
    ]);

    return {
      items: ledgers.map((ledger) => ({
        ledgerId: Number(ledger.id),
        type: ledger.type,
        amount: Number(ledger.amount),
        balanceBefore: Number(ledger.balanceAfter - ledger.amount),
        balanceAfter: Number(ledger.balanceAfter),
        createDate: ledger.createDate,
      })),
      page,
      size,
      totalCount,
    };
  }

  async getPointGrantStatus(userId: number): Promise<GetPointGrantResDto> {
    const account = await this.findAccount(userId);
    const nextAvailableAt = this.nextGrantAt(account, new Date());
    return {
      amount: Number(POINT_GRANT_AMOUNT),
      available: nextAvailableAt === null,
      nextAvailableAt,
      lastGrantedAt: account.lastPointGrantAt,
    };
  }

  /** 추가 포인트를 지급한다. 마지막 지급 후 24시간이 지나야 다시 받을 수 있다. */
  async grantPoint(userId: number): Promise<GrantPointResDto> {
    const account = await this.findAccount(userId);
    const now = new Date();
    const nextAvailableAt = this.nextGrantAt(account, now);
    if (nextAvailableAt) {
      throw new BusinessException(
        AccountErrors.POINT_GRANT_TOO_SOON,
        undefined,
        { nextAvailableAt },
      );
    }

    const cashAfter = account.cash + POINT_GRANT_AMOUNT;
    await this.updateCash(account, {
      type: CashLedgerType.GRANT,
      cashAfter,
      now,
      data: { lastPointGrantAt: now },
    });

    return {
      amount: Number(POINT_GRANT_AMOUNT),
      cashBefore: Number(account.cash),
      cashAfter: Number(cashAfter),
      grantedAt: now,
      nextAvailableAt: new Date(now.getTime() + POINT_GRANT_INTERVAL_MS),
    };
  }

  async getPointResetStatus(userId: number): Promise<GetPointResetResDto> {
    const account = await this.findAccount(userId);
    const now = new Date();
    const conditions = this.checkResetConditions(account, now);
    const unmet = conditions.find(({ met }) => !met);
    return {
      resetCash: Number(INITIAL_CASH),
      cash: Number(account.cash),
      available: !unmet,
      reason: unmet?.reason ?? null,
      conditions: conditions.map(({ condition, met }) => ({ condition, met })),
      nextAvailableAt: this.nextResetAt(account, now),
    };
  }

  /**
   * 보유 포인트를 초기 포인트로 재설정한다. 리셋 조건을 모두 충족해야 한다.
   * 추가 포인트 지급 대기시간은 리셋과 관계없이 유지한다. 실패한 시도도 리셋 이력에 남긴다.
   */
  async resetPoint(userId: number): Promise<ResetPointResDto> {
    const account = await this.findAccount(userId);
    const now = new Date();
    const unmet = this.checkResetConditions(account, now).filter(
      ({ met }) => !met,
    );
    if (unmet.length > 0) {
      const failedConditions = unmet.map(({ condition }) => condition);
      await this.recordResetAttempt(this.prisma, account, now, {
        result: PointResetResult.NOT_ALLOWED,
        failedConditions,
      });
      throw new BusinessException(
        AccountErrors.POINT_RESET_NOT_ALLOWED,
        unmet[0].reason,
        { conditions: failedConditions },
      );
    }

    try {
      await this.updateCash(account, {
        type: CashLedgerType.RESET,
        cashAfter: INITIAL_CASH,
        now,
        data: { lastPointResetAt: now },
        afterUpdate: (tx) =>
          this.recordResetAttempt(tx, account, now, {
            result: PointResetResult.SUCCESS,
            cashAfter: INITIAL_CASH,
          }),
      });
    } catch (error) {
      if (
        error instanceof BusinessException &&
        error.error === AccountErrors.CONCURRENT_UPDATE
      ) {
        await this.recordResetAttempt(this.prisma, account, now, {
          result: PointResetResult.CONFLICT,
        });
      }
      throw error;
    }

    return {
      cashBefore: Number(account.cash),
      cashAfter: Number(INITIAL_CASH),
      resetAt: now,
      nextAvailableAt: new Date(now.getTime() + POINT_RESET_INTERVAL_MS),
    };
  }

  /** 관리자가 포인트를 지급하거나 차감한다. 사용 가능 포인트보다 많이 차감할 수 없다. */
  async adjustCash(userId: number, amount: number): Promise<AdjustCashResDto> {
    const account = await this.findAccount(userId);
    const delta = BigInt(amount);
    const cashAfter = account.cash + delta;
    if (cashAfter < account.lockedCash) {
      throw new BusinessException(AccountErrors.INSUFFICIENT_CASH);
    }

    await this.updateCash(account, {
      type: CashLedgerType.ADJUST,
      cashAfter,
      now: new Date(),
    });

    return {
      amount,
      cashBefore: Number(account.cash),
      cashAfter: Number(cashAfter),
    };
  }

  /** 관리자가 추가 지급 또는 리셋 대기시간을 초기화한다. 테스트용이며 이력은 남기지 않는다. */
  async clearPointCooldown(
    userId: number,
    type: PointCooldownType,
  ): Promise<void> {
    const account = await this.findAccount(userId);
    await this.prisma.account.update({
      where: { id: account.id },
      data:
        type === PointCooldownType.GRANT
          ? { lastPointGrantAt: null }
          : { lastPointResetAt: null },
    });
  }

  private async findAccount(userId: number): Promise<Account> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    if (!account) {
      throw new BusinessException(AccountErrors.NOT_FOUND);
    }
    return account;
  }

  /**
   * 보유 포인트를 바꾸고 이력을 남긴다. 읽은 뒤 다른 요청이 계좌를 바꿨으면 반영하지 않는다.
   */
  private async updateCash(
    account: Account,
    change: {
      type: CashLedgerType;
      cashAfter: bigint;
      now: Date;
      data?: Prisma.AccountUpdateManyMutationInput;
      /** 포인트를 바꾼 뒤 같은 트랜잭션에서 실행한다. */
      afterUpdate?: (tx: Prisma.TransactionClient) => Promise<unknown>;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.account.updateMany({
        where: { id: account.id, version: account.version },
        data: {
          ...change.data,
          cash: change.cashAfter,
          version: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new BusinessException(AccountErrors.CONCURRENT_UPDATE);
      }

      await tx.cashLedger.create({
        data: {
          accountId: account.id,
          type: change.type,
          amount: change.cashAfter - account.cash,
          balanceAfter: change.cashAfter,
          createDate: change.now,
        },
      });
      await change.afterUpdate?.(tx);
    });
  }

  private recordResetAttempt(
    client: Prisma.TransactionClient,
    account: Account,
    now: Date,
    attempt: {
      result: PointResetResult;
      cashAfter?: bigint;
      failedConditions?: PointResetCondition[];
    },
  ) {
    return client.pointResetHistory.create({
      data: {
        accountId: account.id,
        result: attempt.result,
        cashBefore: account.cash,
        cashAfter: attempt.cashAfter,
        failedConditions: attempt.failedConditions ?? [],
        createDate: now,
      },
    });
  }

  private toAccountRes(account: Account): GetMyAccountResDto {
    return {
      cash: Number(account.cash),
      lockedCash: Number(account.lockedCash),
      availableCash: Number(account.cash - account.lockedCash),
    };
  }

  /** 다음 추가 지급 가능 시각. 지금 받을 수 있으면 null */
  private nextGrantAt(account: Account, now: Date): Date | null {
    return this.nextAvailableAt(
      account.lastPointGrantAt,
      POINT_GRANT_INTERVAL_MS,
      now,
    );
  }

  /** 다음 리셋 가능 시각. 리셋한 적이 없거나 7일이 지났으면 null */
  private nextResetAt(account: Account, now: Date): Date | null {
    return this.nextAvailableAt(
      account.lastPointResetAt,
      POINT_RESET_INTERVAL_MS,
      now,
    );
  }

  private nextAvailableAt(
    last: Date | null,
    intervalMs: number,
    now: Date,
  ): Date | null {
    if (!last) {
      return null;
    }
    const next = new Date(last.getTime() + intervalMs);
    return next > now ? next : null;
  }

  /**
   * 리셋 조건을 화면 순서대로 확인한다. 사유 문구는 기획 확정 전 임시 문구다.
   * 보유 종목 0개, 미체결 주문 0건 조건은 주문·보유 테이블이 생기면 앞쪽에 추가한다.
   */
  private checkResetConditions(
    account: Account,
    now: Date,
  ): CheckedResetCondition[] {
    return [
      {
        condition: PointResetCondition.NO_LOCKED_CASH,
        met: account.lockedCash === 0n,
        reason: '주문에 예약된 포인트가 있어 리셋할 수 없습니다.',
      },
      {
        condition: PointResetCondition.CASH_BELOW_LIMIT,
        met: account.cash < POINT_RESET_MAX_CASH,
        reason: `보유 포인트가 ${formatPoint(POINT_RESET_MAX_CASH)} 이상이라 리셋할 수 없습니다.`,
      },
      {
        condition: PointResetCondition.RESET_INTERVAL_PASSED,
        met: this.nextResetAt(account, now) === null,
        reason: '마지막 리셋 후 7일이 지나지 않아 리셋할 수 없습니다.',
      },
    ];
  }
}
