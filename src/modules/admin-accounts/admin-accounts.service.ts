import { Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { randomInt } from 'node:crypto';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  Prisma,
  Role,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { UserErrors } from '../users/users.errors.js';
import {
  ADMIN_CREATE_TX_OPTIONS,
  ADMIN_STATUS_LABELS,
  type AdminChangeableStatus,
  TEMPORARY_PASSWORD_LENGTH,
} from './admin-accounts.constants.js';
import { AdminAccountErrors } from './admin-accounts.errors.js';
import { CreateAdminAccountReqDto } from './dto/req/create-admin-account-req.dto.js';
import { ChangeAdminStatusResDto } from './dto/res/change-admin-status-res.dto.js';
import { CreateAdminAccountResDto } from './dto/res/create-admin-account-res.dto.js';

const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*';

/** 처리한 관리자와 접속 정보 */
export interface AdminActor {
  adminId: number;
  client?: ClientInfo;
}

/** SELECT ... FOR UPDATE로 잠근 관리자 행 */
interface LockedAdminRow {
  user_id: number;
  login_id: string;
  user_status: UserStatus;
}

/** 관리자 계정 생성·상태 변경·비밀번호 변경. 모든 관리자는 같은 ADMIN 권한을 갖는다. */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailSender: MailSender,
    private readonly adminActivityLogs: AdminActivityLogsService,
  ) {}

  /**
   * 관리자 계정을 만들고 임시 비밀번호를 등록 이메일로 보낸다. 메일을 보내지 못하면 계정도 만들지 않는다.
   * 만든 계정은 비밀번호를 바꾸기 전까지 비밀번호 변경 외 관리자 API를 쓸 수 없다.
   */
  async create(
    dto: CreateAdminAccountReqDto,
    actor: AdminActor,
  ): Promise<CreateAdminAccountResDto> {
    await this.assertNotDuplicated(dto);
    const temporaryPassword = generateTemporaryPassword();
    const password = await hash(temporaryPassword);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            loginId: dto.loginId,
            password,
            email: dto.email,
            role: Role.ADMIN,
            termsAgreed: false,
            privacyAgreed: false,
            marketingAgreed: false,
            adminProfile: {
              create: { name: dto.name, duty: dto.duty ?? null },
            },
          },
          include: { adminProfile: true },
        });
        const profile = user.adminProfile!;

        await this.adminActivityLogs.record(
          {
            adminId: actor.adminId,
            targetType: AdminActivityTarget.ADMIN,
            targetId: user.id,
            targetLabel: user.loginId,
            action: AdminActivityAction.ADMIN_CREATE,
            summary: `관리자 계정 생성 (${profile.name})`,
            after: {
              loginId: user.loginId,
              name: profile.name,
              email: dto.email,
              duty: profile.duty,
            },
            client: actor.client,
          },
          tx,
        );
        // 메일 발송이 실패하면 트랜잭션과 함께 계정 생성도 취소된다.
        await this.mailSender.send({
          to: dto.email,
          subject: '[MOTU] 관리자 계정 안내',
          text: [
            `${profile.name}님, MOTU 관리자 계정이 만들어졌습니다.`,
            `아이디: ${user.loginId}`,
            `임시 비밀번호: ${temporaryPassword}`,
            '처음 로그인한 뒤 비밀번호를 변경해야 관리자 기능을 이용할 수 있습니다.',
          ].join('\n'),
        });

        return {
          userId: user.id,
          loginId: user.loginId,
          name: profile.name,
          email: dto.email,
          duty: profile.duty,
          userStatus: user.userStatus,
          passwordChangeRequired: profile.passwordChangeRequired,
          createDate: user.createDate,
        };
      }, ADMIN_CREATE_TX_OPTIONS);
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const meta = JSON.stringify(error.meta ?? {});
      // 중복 확인과 생성 사이에 같은 아이디·이메일로 먼저 만들어진 경우
      if (meta.includes('login_id') || meta.includes('loginId')) {
        throw new BusinessException(UserErrors.LOGIN_ID_DUPLICATED);
      }
      if (meta.includes('email')) {
        throw new BusinessException(UserErrors.EMAIL_DUPLICATED);
      }
      throw new BusinessException(UserErrors.DUPLICATED);
    }
  }

  /**
   * 관리자 계정을 정상 또는 정지로 바꾸고 사유를 관리자 활동 이력에 남긴다. 정지하면 로그인 세션을 모두 만료한다.
   * 본인 정지와, 정지 후 정상 관리자가 0명이 되는 변경은 막는다. 둘 다 해당하면 본인 정지 오류가 먼저다.
   */
  async changeStatus(
    userId: number,
    status: AdminChangeableStatus,
    reason: string,
    actor: AdminActor,
  ): Promise<ChangeAdminStatusResDto> {
    if (status === UserStatus.BLOCKED && userId === actor.adminId) {
      throw new BusinessException(AdminAccountErrors.SELF_BLOCK);
    }

    return this.prisma.$transaction(async (tx) => {
      // 관리자 둘이 동시에 서로를 정지해 정상 관리자가 0명이 되지 않도록 관리자 행을 모두 잠근다.
      const admins = await tx.$queryRaw<LockedAdminRow[]>`
        SELECT user_id, login_id, user_status
        FROM users
        WHERE role = 'ADMIN'
        ORDER BY user_id
        FOR UPDATE
      `;
      const target = admins.find((admin) => admin.user_id === userId);
      if (!target) {
        throw new BusinessException(AdminAccountErrors.NOT_FOUND);
      }
      if (target.user_status === status) {
        throw new BusinessException(AdminAccountErrors.STATUS_UNCHANGED);
      }
      if (
        status === UserStatus.BLOCKED &&
        !admins.some(
          (admin) =>
            admin.user_id !== userId && admin.user_status === UserStatus.ACTIVE,
        )
      ) {
        throw new BusinessException(AdminAccountErrors.LAST_ACTIVE_ADMIN);
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          userStatus: status,
          // 정상으로 되돌리면 로그인 실패 횟수도 새로 센다.
          ...(status === UserStatus.ACTIVE ? { loginFailCount: 0 } : {}),
        },
      });
      if (status === UserStatus.BLOCKED) {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.adminActivityLogs.record(
        {
          adminId: actor.adminId,
          targetType: AdminActivityTarget.ADMIN,
          targetId: userId,
          targetLabel: target.login_id,
          action: AdminActivityAction.ADMIN_STATUS_CHANGE,
          summary: `${ADMIN_STATUS_LABELS[target.user_status]} → ${ADMIN_STATUS_LABELS[status]}`,
          before: { userStatus: target.user_status },
          after: { userStatus: status },
          reason,
          client: actor.client,
        },
        tx,
      );

      return {
        userId,
        statusBefore: target.user_status,
        statusAfter: status,
      };
    });
  }

  /**
   * 로그인한 관리자의 비밀번호를 바꾼다. 임시 비밀번호 상태도 함께 푼다.
   */
  async changePassword(
    adminId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const admin = await this.prisma.user.findFirst({
      where: { id: adminId, role: Role.ADMIN },
      select: { id: true, password: true },
    });
    if (!admin) {
      throw new BusinessException(AdminAccountErrors.NOT_FOUND);
    }
    if (!(await verify(admin.password, currentPassword))) {
      throw new BusinessException(AdminAccountErrors.INVALID_CURRENT_PASSWORD);
    }
    if (currentPassword === newPassword) {
      throw new BusinessException(AdminAccountErrors.SAME_PASSWORD);
    }

    const password = await hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      // 읽은 뒤 다른 요청이 먼저 바꿨으면 덮어쓰지 않는다.
      const { count } = await tx.user.updateMany({
        where: { id: admin.id, password: admin.password },
        data: { password },
      });
      if (count === 0) {
        throw new BusinessException(
          AdminAccountErrors.INVALID_CURRENT_PASSWORD,
        );
      }
      await tx.adminProfile.updateMany({
        where: { userId: admin.id, passwordChangeRequired: true },
        data: { passwordChangeRequired: false },
      });
    });
  }

  private async assertNotDuplicated(
    dto: CreateAdminAccountReqDto,
  ): Promise<void> {
    const [byLoginId, byEmail] = await Promise.all([
      this.prisma.user.findUnique({
        where: { loginId: dto.loginId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      }),
    ]);
    if (byLoginId) {
      throw new BusinessException(UserErrors.LOGIN_ID_DUPLICATED);
    }
    if (byEmail) {
      throw new BusinessException(UserErrors.EMAIL_DUPLICATED);
    }
  }
}

/** 영문 대소문자·숫자·특수문자를 각각 1개 이상 섞은 임시 비밀번호. 헷갈리는 문자(0, O, 1, l, I)는 뺀다. */
export function generateTemporaryPassword(): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [LOWER, UPPER, DIGITS, SYMBOLS].map(pick);
  while (chars.length < TEMPORARY_PASSWORD_LENGTH) {
    chars.push(pick(all));
  }
  // 종류별 문자가 항상 앞에 오지 않도록 섞는다.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}
