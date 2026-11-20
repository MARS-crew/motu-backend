import { hash } from 'argon2';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { MailErrors } from '../../common/mail/mail.errors.js';
import type { MailSender } from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  Prisma,
  Role,
  UserStatus,
} from '../../generated/prisma/client.js';
import type { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { PASSWORD_PATTERN } from '../users/users.constants.js';
import { UserErrors } from '../users/users.errors.js';
import { ADMIN_CREATE_TX_OPTIONS } from './admin-accounts.constants.js';
import { AdminAccountErrors } from './admin-accounts.errors.js';
import {
  AdminAccountsService,
  generateTemporaryPassword,
} from './admin-accounts.service.js';
import { CreateAdminAccountReqDto } from './dto/req/create-admin-account-req.dto.js';

describe('AdminAccountsService', () => {
  const user = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const refreshToken = { updateMany: vi.fn() };
  const adminProfile = { updateMany: vi.fn() };
  const tx = {
    user,
    refreshToken,
    adminProfile,
    $queryRaw: vi.fn(),
  };
  const prisma = {
    user,
    $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const mailSender = { send: vi.fn() };
  const adminActivityLogs = { record: vi.fn() };
  const service = new AdminAccountsService(
    prisma as unknown as PrismaService,
    mailSender as unknown as MailSender,
    adminActivityLogs as unknown as AdminActivityLogsService,
  );

  const actor = { adminId: 1, client: { ipAddress: '192.168.10.24' } };
  const CREATED = new Date('2026-11-19T09:00:00.000Z');
  const dtoOf = (overrides: Partial<CreateAdminAccountReqDto> = {}) =>
    Object.assign(new CreateAdminAccountReqDto(), {
      loginId: 'admin04',
      name: '최운영',
      email: 'admin04@motu.app',
      duty: '상장 심사',
      ...overrides,
    });
  const createdUser = (data: {
    loginId: string;
    email: string;
    adminProfile: { create: { name: string; duty: string | null } };
  }) => ({
    id: 4,
    loginId: data.loginId,
    email: data.email,
    userStatus: UserStatus.ACTIVE,
    createDate: CREATED,
    adminProfile: { ...data.adminProfile.create, passwordChangeRequired: true },
  });
  const p2002 = (target: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: [target] },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    user.findUnique.mockResolvedValue(null);
    user.create.mockImplementation(({ data }) =>
      Promise.resolve(createdUser(data)),
    );
    mailSender.send.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('관리자 계정과 관리자 정보를 만들고 임시 비밀번호를 메일로 보낸다', async () => {
      const result = await service.create(dtoOf(), actor);

      expect(result).toEqual({
        userId: 4,
        loginId: 'admin04',
        name: '최운영',
        email: 'admin04@motu.app',
        duty: '상장 심사',
        userStatus: UserStatus.ACTIVE,
        passwordChangeRequired: true,
        createDate: CREATED,
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        ADMIN_CREATE_TX_OPTIONS,
      );

      const [{ data }] = user.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(data).toMatchObject({
        loginId: 'admin04',
        email: 'admin04@motu.app',
        role: Role.ADMIN,
        termsAgreed: false,
        privacyAgreed: false,
        marketingAgreed: false,
        adminProfile: { create: { name: '최운영', duty: '상장 심사' } },
      });
      // 관리자에게 의미 없는 회원 정보는 비워 둔다.
      expect(data).not.toHaveProperty('nickname');
      expect(data).not.toHaveProperty('birthDate');
      expect(data.password).toMatch(/^\$argon2/);

      const [mail] = mailSender.send.mock.calls[0] as [
        { to: string; text: string },
      ];
      expect(mail.to).toBe('admin04@motu.app');
      const temporary = /임시 비밀번호: (\S+)/.exec(mail.text)?.[1];
      expect(temporary).toMatch(PASSWORD_PATTERN);
      expect(mail.text).toContain('아이디: admin04');

      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        {
          adminId: 1,
          targetType: AdminActivityTarget.ADMIN,
          targetId: 4,
          targetLabel: 'admin04',
          action: AdminActivityAction.ADMIN_CREATE,
          summary: '관리자 계정 생성 (최운영)',
          after: {
            loginId: 'admin04',
            name: '최운영',
            email: 'admin04@motu.app',
            duty: '상장 심사',
          },
          client: actor.client,
        },
        tx,
      );
      // 활동 이력에 임시 비밀번호를 남기지 않는다.
      expect(JSON.stringify(adminActivityLogs.record.mock.calls)).not.toContain(
        temporary,
      );
    });

    it('담당 업무가 없으면 null로 저장한다', async () => {
      const result = await service.create(dtoOf({ duty: undefined }), actor);

      expect(result.duty).toBeNull();
    });

    it.each([
      ['아이디', { loginId: 'admin04' }, UserErrors.LOGIN_ID_DUPLICATED],
      ['이메일', { email: 'admin04@motu.app' }, UserErrors.EMAIL_DUPLICATED],
    ])('%s가 이미 있으면 거부한다', async (_, where, error) => {
      user.findUnique.mockImplementation(
        (args: { where: Record<string, string> }) =>
          Promise.resolve(
            Object.entries(where).every(
              ([key, value]) => args.where[key] === value,
            )
              ? { id: 9 }
              : null,
          ),
      );

      await expect(service.create(dtoOf(), actor)).rejects.toEqual(
        new BusinessException(error),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('메일을 보내지 못하면 에러를 던져 트랜잭션과 함께 계정 생성을 취소한다', async () => {
      mailSender.send.mockRejectedValue(
        new BusinessException(MailErrors.SEND_FAILED),
      );

      await expect(service.create(dtoOf(), actor)).rejects.toEqual(
        new BusinessException(MailErrors.SEND_FAILED),
      );
    });

    it.each([
      ['login_id', UserErrors.LOGIN_ID_DUPLICATED],
      ['email', UserErrors.EMAIL_DUPLICATED],
    ])(
      '확인 뒤 같은 %s로 먼저 만들어졌으면 중복 에러로 바꾼다',
      async (target, error) => {
        user.create.mockRejectedValueOnce(p2002(target));

        await expect(service.create(dtoOf(), actor)).rejects.toEqual(
          new BusinessException(error),
        );
        expect(user.create).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('changeStatus', () => {
    const adminRow = (userId: number, userStatus: UserStatus) => ({
      user_id: userId,
      login_id: `admin0${userId}`,
      user_status: userStatus,
    });

    it('정지하면 상태를 바꾸고 세션을 만료한 뒤 사유를 활동 이력에 남긴다', async () => {
      tx.$queryRaw.mockResolvedValue([
        adminRow(1, UserStatus.ACTIVE),
        adminRow(3, UserStatus.ACTIVE),
      ]);

      await expect(
        service.changeStatus(3, UserStatus.BLOCKED, '내부 권한 회수', actor),
      ).resolves.toEqual({
        userId: 3,
        statusBefore: UserStatus.ACTIVE,
        statusAfter: UserStatus.BLOCKED,
      });
      const [sql] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('')).toMatch(/WHERE role = 'ADMIN'[\s\S]*FOR UPDATE/);
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { userStatus: UserStatus.BLOCKED },
      });
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 3, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        {
          adminId: 1,
          targetType: AdminActivityTarget.ADMIN,
          targetId: 3,
          targetLabel: 'admin03',
          action: AdminActivityAction.ADMIN_STATUS_CHANGE,
          summary: '정상 → 정지',
          before: { userStatus: UserStatus.ACTIVE },
          after: { userStatus: UserStatus.BLOCKED },
          reason: '내부 권한 회수',
          client: actor.client,
        },
        tx,
      );
    });

    it('정상으로 되돌리면 로그인 실패 횟수를 초기화하고 세션은 그대로 둔다', async () => {
      tx.$queryRaw.mockResolvedValue([
        adminRow(1, UserStatus.ACTIVE),
        adminRow(3, UserStatus.BLOCKED),
      ]);

      await service.changeStatus(3, UserStatus.ACTIVE, '권한 복구', actor);

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { userStatus: UserStatus.ACTIVE, loginFailCount: 0 },
      });
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('본인 계정은 정지할 수 없다 (E01)', async () => {
      await expect(
        service.changeStatus(1, UserStatus.BLOCKED, '사유', actor),
      ).rejects.toEqual(new BusinessException(AdminAccountErrors.SELF_BLOCK));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('정상 관리자가 0명이 되면 거부한다 (E02)', async () => {
      tx.$queryRaw.mockResolvedValue([
        adminRow(1, UserStatus.LOCKED),
        adminRow(3, UserStatus.ACTIVE),
      ]);

      await expect(
        service.changeStatus(3, UserStatus.BLOCKED, '사유', actor),
      ).rejects.toEqual(
        new BusinessException(AdminAccountErrors.LAST_ACTIVE_ADMIN),
      );
      expect(user.update).not.toHaveBeenCalled();
      expect(adminActivityLogs.record).not.toHaveBeenCalled();
    });

    it('본인 정지이면서 마지막 정상 관리자면 본인 정지 오류가 먼저다', async () => {
      tx.$queryRaw.mockResolvedValue([adminRow(1, UserStatus.ACTIVE)]);

      await expect(
        service.changeStatus(1, UserStatus.BLOCKED, '사유', actor),
      ).rejects.toEqual(new BusinessException(AdminAccountErrors.SELF_BLOCK));
    });

    it('관리자가 아니면 찾을 수 없다', async () => {
      tx.$queryRaw.mockResolvedValue([adminRow(1, UserStatus.ACTIVE)]);

      await expect(
        service.changeStatus(2, UserStatus.BLOCKED, '사유', actor),
      ).rejects.toEqual(new BusinessException(AdminAccountErrors.NOT_FOUND));
    });

    it('이미 그 상태면 거부한다', async () => {
      tx.$queryRaw.mockResolvedValue([
        adminRow(1, UserStatus.ACTIVE),
        adminRow(3, UserStatus.BLOCKED),
      ]);

      await expect(
        service.changeStatus(3, UserStatus.BLOCKED, '사유', actor),
      ).rejects.toEqual(
        new BusinessException(AdminAccountErrors.STATUS_UNCHANGED),
      );
    });
  });

  describe('changePassword', () => {
    let currentHash: string;
    beforeAll(async () => {
      currentHash = await hash('Tmp#a1b2c3d4');
    });
    beforeEach(() => {
      user.findFirst.mockResolvedValue({ id: 4, password: currentHash });
      user.updateMany.mockResolvedValue({ count: 1 });
    });

    it('비밀번호를 바꾸고 임시 비밀번호 상태를 푼다', async () => {
      await service.changePassword(4, 'Tmp#a1b2c3d4', 'motuadmin2!');

      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 4, role: Role.ADMIN },
        select: { id: true, password: true },
      });
      const [{ where, data }] = user.updateMany.mock.calls[0] as [
        { where: unknown; data: { password: string } },
      ];
      expect(where).toEqual({ id: 4, password: currentHash });
      expect(data.password).toMatch(/^\$argon2/);
      expect(data.password).not.toBe(currentHash);
      expect(adminProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: 4, passwordChangeRequired: true },
        data: { passwordChangeRequired: false },
      });
    });

    it('현재 비밀번호가 틀리면 거부한다', async () => {
      await expect(
        service.changePassword(4, 'wrong#123', 'motuadmin2!'),
      ).rejects.toEqual(
        new BusinessException(AdminAccountErrors.INVALID_CURRENT_PASSWORD),
      );
      expect(user.updateMany).not.toHaveBeenCalled();
    });

    it('현재 비밀번호와 같으면 거부한다', async () => {
      await expect(
        service.changePassword(4, 'Tmp#a1b2c3d4', 'Tmp#a1b2c3d4'),
      ).rejects.toEqual(
        new BusinessException(AdminAccountErrors.SAME_PASSWORD),
      );
    });

    it('그사이 비밀번호가 바뀌었으면 덮어쓰지 않는다', async () => {
      user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changePassword(4, 'Tmp#a1b2c3d4', 'motuadmin2!'),
      ).rejects.toEqual(
        new BusinessException(AdminAccountErrors.INVALID_CURRENT_PASSWORD),
      );
      expect(adminProfile.updateMany).not.toHaveBeenCalled();
    });

    it('관리자가 아니면 찾을 수 없다', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword(2, 'Tmp#a1b2c3d4', 'motuadmin2!'),
      ).rejects.toEqual(new BusinessException(AdminAccountErrors.NOT_FOUND));
    });
  });

  it('임시 비밀번호는 12자이고 회원 비밀번호 규칙을 지킨다', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(12);
      expect(password).toMatch(PASSWORD_PATTERN);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
    }
  });
});
