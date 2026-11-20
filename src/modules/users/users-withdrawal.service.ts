import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import {
  ListingApplicationStatus,
  Role,
  TradeStatus,
  TwoFactorStatus,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { UserErrors } from './users.errors.js';

@Injectable()
export class UsersWithdrawalService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly ordersService: OrdersService,
  ) {}

  /** 주문 취소, 포인트 소멸, 탈퇴 상태 및 세션 폐기를 한 트랜잭션에서 처리한다. */
  async withdraw(userId: number, reason: string): Promise<void> {
    const accountId = await this.accountsService.getAccountId(userId);

    await this.ordersService.cancelOpenOrdersForWithdrawal(
      accountId,
      async (tx, now) => {
        await this.accountsService.expirePointsForWithdrawal(
          tx,
          accountId,
          now,
        );

        // 알림 발송과 같은 순서로 알림 행을 먼저 잠그는다.
        await tx.priceAlert.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });

        const { count } = await tx.user.updateMany({
          where: {
            id: userId,
            role: Role.USER,
            userStatus: UserStatus.ACTIVE,
          },
          data: {
            userStatus: UserStatus.WITHDRAWN,
            // Signup IDs can only contain lowercase letters and digits.
            loginId: `withdrawn_${userId}`,
            email: null,
            nickname: null,
            birthDate: null,
            phoneNumber: null,
            twoFactorPhoneNumber: null,
            twoFactorStatus: TwoFactorStatus.NOT_SET,
            twoFactorEnabledDate: null,
            twoFactorVerifiedDate: null,
            twoFactorLockedUntil: null,
            twoFactorFailCount: 0,
            reason,
            deletedDate: now,
            isDeleted: true,
          },
        });
        if (count === 0) {
          throw new BusinessException(UserErrors.STATUS_CONFLICT);
        }

        await tx.twoFactorHistory.updateMany({
          where: { userId, phoneNumber: { not: null } },
          data: { phoneNumber: null },
        });
        await tx.trustedDevice.deleteMany({ where: { userId } });

        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
      },
      async (tx) => {
        const pendingListing = await tx.listingApplication.findFirst({
          where: {
            userId,
            status: ListingApplicationStatus.APPROVED,
            deletedDate: null,
            stock: {
              is: { tradeStatus: TradeStatus.PENDING, isDeleted: false },
            },
          },
          select: { id: true },
        });

        if (pendingListing) {
          throw new BusinessException(UserErrors.WITHDRAWAL_PENDING_LISTING);
        }
      },
    );
  }
}
