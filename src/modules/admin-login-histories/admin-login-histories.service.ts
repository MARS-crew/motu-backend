import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminLoginFailureReason,
  AdminLoginResult,
  Prisma,
} from '../../generated/prisma/client.js';

/** 관리자 접속 이력 (ADM-AUTH-01). 로그인 시도 결과와 접속 IP·기기·일시를 남긴다. */
@Injectable()
export class AdminLoginHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** @param tx 세션 발급과 함께 롤백되도록 로그인 트랜잭션을 넘긴다. */
  async recordSuccess(
    adminId: number,
    client: ClientInfo = {},
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.adminLoginHistory.create({
      data: {
        adminId,
        result: AdminLoginResult.SUCCESS,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      },
    });
  }

  async recordFailure(
    adminId: number,
    failureReason: AdminLoginFailureReason,
    client: ClientInfo = {},
  ): Promise<void> {
    await this.prisma.adminLoginHistory.create({
      data: {
        adminId,
        result: AdminLoginResult.FAILURE,
        failureReason,
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      },
    });
  }
}
