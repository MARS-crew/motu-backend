import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { Role, UserStatus } from '../../generated/prisma/client.js';
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
  async withdraw(userId: number): Promise<void> {
    const accountId = await this.accountsService.getAccountId(userId);

    await this.ordersService.cancelOpenOrdersForWithdrawal(
      accountId,
      async (tx, now) => {
        await this.accountsService.expirePointsForWithdrawal(
          tx,
          accountId,
          now,
        );

        const { count } = await tx.user.updateMany({
          where: {
            id: userId,
            role: Role.USER,
            userStatus: UserStatus.ACTIVE,
          },
          data: { userStatus: UserStatus.WITHDRAWN },
        });
        if (count === 0) {
          throw new BusinessException(UserErrors.STATUS_CONFLICT);
        }

        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
      },
    );
  }
}
