import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { UsersWithdrawalService } from './users-withdrawal.service.js';

describe('UsersWithdrawalService', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  const tx = {
    listingApplication: { findFirst: vi.fn() },
    user: { updateMany: vi.fn() },
    priceAlert: { updateMany: vi.fn() },
    twoFactorHistory: { updateMany: vi.fn() },
    trustedDevice: { deleteMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    passwordResetToken: { updateMany: vi.fn() },
  };
  const client = tx as unknown as Prisma.TransactionClient;
  const accounts = {
    getAccountId: vi.fn(),
    expirePointsForWithdrawal: vi.fn(),
  };
  const orders = {
    cancelOpenOrdersForWithdrawal: vi.fn(
      async (
        _accountId: number,
        finish: (tx: Prisma.TransactionClient, time: Date) => Promise<void>,
        validate: (tx: Prisma.TransactionClient) => Promise<void>,
      ) => {
        await validate(client);
        await finish(client, now);
      },
    ),
  };
  const service = new UsersWithdrawalService(
    accounts as unknown as AccountsService,
    orders as unknown as OrdersService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    accounts.getAccountId.mockResolvedValue(10);
    tx.listingApplication.findFirst.mockResolvedValue(null);
    tx.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('clears identifiers, alert and session data under the same transaction', async () => {
    await service.withdraw(1, 'Withdrawal reason');

    expect(accounts.expirePointsForWithdrawal).toHaveBeenCalledWith(
      client,
      10,
      now,
    );
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 1, role: 'USER', userStatus: 'ACTIVE' },
      data: expect.objectContaining({
        loginId: 'withdrawn_1',
        email: null,
        nickname: null,
        birthDate: null,
        phoneNumber: null,
        twoFactorPhoneNumber: null,
        twoFactorStatus: 'NOT_SET',
        userStatus: 'WITHDRAWN',
        reason: 'Withdrawal reason',
        deletedDate: now,
        isDeleted: true,
      }),
    });
    expect(tx.priceAlert.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, isActive: true },
      data: { isActive: false },
    });
    expect(tx.twoFactorHistory.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, phoneNumber: { not: null } },
      data: { phoneNumber: null },
    });
    expect(tx.trustedDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1 },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null },
      data: { revokedAt: now },
    });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, usedAt: null },
      data: { usedAt: now },
    });
  });

  it('returns 409 for an approved pending stock before applying any cleanup', async () => {
    tx.listingApplication.findFirst.mockResolvedValue({ id: 100 });

    await expect(
      service.withdraw(1, 'Withdrawal reason'),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'USER_WITHDRAWAL_PENDING_LISTING' },
    });
    expect(tx.listingApplication.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 1,
        status: 'APPROVED',
        deletedDate: null,
        stock: { is: { tradeStatus: 'PENDING', isDeleted: false } },
      },
      select: { id: true },
    });
    expect(accounts.expirePointsForWithdrawal).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.priceAlert.updateMany).not.toHaveBeenCalled();
    expect(tx.trustedDevice.deleteMany).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
