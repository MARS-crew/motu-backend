import { Injectable } from '@nestjs/common';
import {
  Account,
  CashLedgerType,
  Prisma,
} from '../../generated/prisma/client.js';
import { INITIAL_CASH } from './accounts.constants.js';

@Injectable()
export class AccountsService {
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
}
