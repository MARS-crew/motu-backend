import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import { maskEmail, maskPhoneNumber } from '../../common/utils/masking.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  AnomalyAction,
  OrderStatus,
  Prisma,
  Role,
  User,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { AnomaliesService } from '../anomalies/anomalies.service.js';
import { GetAdminUsersReqDto } from './dto/req/get-admin-users-req.dto.js';
import { ChangeUserStatusResDto } from './dto/res/change-user-status-res.dto.js';
import { GetAdminUserResDto } from './dto/res/get-admin-user-res.dto.js';
import {
  AdminUserItemResDto,
  GetAdminUsersResDto,
} from './dto/res/get-admin-users-res.dto.js';
import { UserErrors } from './users.errors.js';

const STATUS_LABELS: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: '정상',
  [UserStatus.LOCKED]: '잠금',
  [UserStatus.BLOCKED]: '정지',
  [UserStatus.WITHDRAWN]: '탈퇴',
};

/** 관리자 처리를 남길 때 함께 받는 값 */
export interface AdminAction {
  adminId: number;
  reason: string;
  client?: ClientInfo;
}

/** 관리자 회원 관리. 일반 회원(USER)만 다루고 관리자 계정은 관리자 계정 관리에서 다룬다. */
@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminActivityLogs: AdminActivityLogsService,
    private readonly anomalies: AnomaliesService,
  ) {}

  /** 회원 목록. 가입일 최신순이다. */
  async getUsers(query: GetAdminUsersReqDto): Promise<GetAdminUsersResDto> {
    const where: Prisma.UserWhereInput = {
      role: Role.USER,
      loginId: query.loginId ? { contains: query.loginId } : undefined,
      nickname: query.nickname ? { contains: query.nickname } : undefined,
      userStatus: query.status,
    };
    const [users, totalCount] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.toItem(user)),
      page: query.page,
      size: query.size,
      totalCount,
    };
  }

  /** 회원 상세. 인증·계정 정보와 자산·활동 정보를 함께 내려준다. */
  async getUser(userId: number): Promise<GetAdminUserResDto> {
    const user = await this.findUser(userId);
    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    const [holdingCount, openOrderCount] = account
      ? await Promise.all([
          this.prisma.holding.count({ where: { accountId: account.id } }),
          this.prisma.order.count({
            where: {
              accountId: account.id,
              status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
            },
          }),
        ])
      : [0, 0];

    return Object.assign(this.toItem(user), {
      security: {
        emailVerified: true,
        twoFactorStatus: user.twoFactorStatus,
        twoFactorPhoneNumber: user.twoFactorPhoneNumber
          ? maskPhoneNumber(user.twoFactorPhoneNumber)
          : null,
        twoFactorVerifiedDate: user.twoFactorVerifiedDate,
        loginFailCount: user.loginFailCount,
      },
      asset: {
        availableCash: account ? Number(account.cash - account.lockedCash) : 0,
        lockedCash: account ? Number(account.lockedCash) : 0,
        holdingCount,
        openOrderCount,
      },
    });
  }

  /**
   * 회원 상태를 바꾼다. 잠금·정지로 바꾸면 로그인 세션을 모두 만료한다.
   * 잠금에서 정상으로 바꾸면 로그인 실패 횟수도 0으로 초기화한다.
   */
  async changeStatus(
    userId: number,
    status: UserStatus,
    action: AdminAction,
    anomalyId?: number,
  ): Promise<ChangeUserStatusResDto> {
    const user = await this.findUser(userId);
    if (
      user.userStatus === UserStatus.WITHDRAWN ||
      status === UserStatus.WITHDRAWN
    ) {
      throw new BusinessException(UserErrors.WITHDRAWN_STATUS_IMMUTABLE);
    }
    if (user.userStatus === status) {
      throw new BusinessException(UserErrors.STATUS_UNCHANGED);
    }
    // 이상 거래 상세에서 넘어온 회원 정지면 그 이상 거래가 이 회원의 것인지 먼저 확인한다.
    const anomaly =
      anomalyId === undefined
        ? undefined
        : await this.anomalies.assertActionable(anomalyId, {
            action: AnomalyAction.USER_BLOCK,
            userId,
            userStatus: status,
          });
    const resetFailCount =
      user.userStatus === UserStatus.LOCKED && status === UserStatus.ACTIVE;

    await this.prisma.$transaction(async (tx) => {
      await this.updateStatus(tx, user, {
        userStatus: status,
        ...(resetFailCount ? { loginFailCount: 0 } : {}),
      });
      if (status !== UserStatus.ACTIVE) {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.adminActivityLogs.record(
        {
          adminId: action.adminId,
          targetType: AdminActivityTarget.USER,
          targetId: userId,
          targetLabel: user.loginId,
          action: AdminActivityAction.USER_STATUS_CHANGE,
          summary: `${STATUS_LABELS[user.userStatus]} → ${STATUS_LABELS[status]}`,
          before: { userStatus: user.userStatus },
          after: { userStatus: status },
          reason: action.reason,
          client: action.client,
        },
        tx,
      );
      if (anomaly) {
        await this.anomalies.resolve(
          tx,
          anomaly,
          AnomalyAction.USER_BLOCK,
          action.reason,
          action,
        );
      }
    });

    return { userId, statusBefore: user.userStatus, statusAfter: status };
  }

  /** 잠금 계정을 정상으로 되돌리고 로그인 실패 횟수를 0으로 초기화한다. */
  async unlock(
    userId: number,
    action: AdminAction,
  ): Promise<ChangeUserStatusResDto> {
    const user = await this.findUser(userId);
    if (user.userStatus !== UserStatus.LOCKED) {
      throw new BusinessException(UserErrors.NOT_LOCKED);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.updateStatus(tx, user, {
        userStatus: UserStatus.ACTIVE,
        loginFailCount: 0,
      });
      await this.adminActivityLogs.record(
        {
          adminId: action.adminId,
          targetType: AdminActivityTarget.USER,
          targetId: userId,
          targetLabel: user.loginId,
          action: AdminActivityAction.USER_UNLOCK,
          summary: `${STATUS_LABELS[UserStatus.LOCKED]} → ${STATUS_LABELS[UserStatus.ACTIVE]}`,
          before: {
            userStatus: UserStatus.LOCKED,
            loginFailCount: user.loginFailCount,
          },
          after: { userStatus: UserStatus.ACTIVE, loginFailCount: 0 },
          reason: action.reason,
          client: action.client,
        },
        tx,
      );
    });

    return {
      userId,
      statusBefore: UserStatus.LOCKED,
      statusAfter: UserStatus.ACTIVE,
    };
  }

  private async findUser(userId: number): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: Role.USER },
    });
    if (!user) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    return user;
  }

  /** 읽은 상태 그대로일 때만 바꾼다. 그사이 로그인 실패로 잠기거나 다른 관리자가 바꿨으면 막는다. */
  private async updateStatus(
    tx: Prisma.TransactionClient,
    user: User,
    data: Prisma.UserUpdateManyMutationInput,
  ): Promise<void> {
    const { count } = await tx.user.updateMany({
      where: { id: user.id, userStatus: user.userStatus },
      data,
    });
    if (count === 0) {
      throw new BusinessException(UserErrors.STATUS_CONFLICT);
    }
  }

  private toItem(user: User): AdminUserItemResDto {
    return {
      userId: user.id,
      loginId: user.loginId,
      nickname: user.nickname,
      email: maskEmail(user.email),
      createDate: user.createDate,
      userStatus: user.userStatus,
      lastLoginDate: user.lastLoginDate,
    };
  }
}
