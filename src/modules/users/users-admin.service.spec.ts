import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  AnomalyAction,
  OrderStatus,
  Role,
  TwoFactorStatus,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { AnomaliesService } from '../anomalies/anomalies.service.js';
import { GetAdminUsersReqDto } from './dto/req/get-admin-users-req.dto.js';
import { UsersAdminService } from './users-admin.service.js';

describe('UsersAdminService', () => {
  const user = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  };
  const account = { findUnique: vi.fn() };
  const holding = { count: vi.fn() };
  const order = { count: vi.fn() };
  const refreshToken = { updateMany: vi.fn() };
  const tx = { user, refreshToken };
  const prisma = {
    user,
    account,
    holding,
    order,
    refreshToken,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;
  const adminActivityLogs = { record: vi.fn() };
  const anomalies = { assertActionable: vi.fn(), resolve: vi.fn() };
  const service = new UsersAdminService(
    prisma,
    adminActivityLogs as unknown as AdminActivityLogsService,
    anomalies as unknown as AnomaliesService,
  );

  const userOf = (overrides: Record<string, unknown> = {}) => ({
    id: 6,
    loginId: 'sunjung01',
    nickname: '선정',
    email: 'sunjung01@mail.com',
    role: Role.USER,
    userStatus: UserStatus.ACTIVE,
    loginFailCount: 0,
    lastLoginDate: new Date('2026-09-06T11:14:00Z'),
    twoFactorStatus: TwoFactorStatus.ENABLED,
    twoFactorPhoneNumber: '01012341234',
    twoFactorVerifiedDate: new Date('2026-09-06T10:42:00Z'),
    createDate: new Date('2026-09-01T03:00:00Z'),
    ...overrides,
  });
  const action = {
    adminId: 1,
    reason: '운영정책 위반에 따른 이용 정지 처리',
    client: { ipAddress: '192.168.10.24' },
  };

  const queryOf = (overrides: Partial<GetAdminUsersReqDto> = {}) =>
    Object.assign(new GetAdminUsersReqDto(), overrides);

  beforeEach(() => {
    vi.clearAllMocks();
    user.findMany.mockResolvedValue([userOf()]);
    user.count.mockResolvedValue(1);
    user.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('getUsers', () => {
    it('일반 회원만 가입일 최신순으로 10건씩 내려준다', async () => {
      const result = await service.getUsers(queryOf());

      expect(user.findMany).toHaveBeenCalledWith({
        where: {
          role: Role.USER,
          loginId: undefined,
          nickname: undefined,
          userStatus: undefined,
        },
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        items: [
          {
            userId: 6,
            loginId: 'sunjung01',
            nickname: '선정',
            email: 'su*******@mail.com',
            createDate: new Date('2026-09-01T03:00:00Z'),
            userStatus: UserStatus.ACTIVE,
            lastLoginDate: new Date('2026-09-06T11:14:00Z'),
          },
        ],
        page: 1,
        size: 10,
        totalCount: 1,
      });
    });

    it('아이디·닉네임 부분 일치와 상태로 거른다', async () => {
      await service.getUsers(
        queryOf({
          loginId: 'sun',
          nickname: '선',
          status: UserStatus.LOCKED,
          page: 3,
        }),
      );

      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            role: Role.USER,
            loginId: { contains: 'sun' },
            nickname: { contains: '선' },
            userStatus: UserStatus.LOCKED,
          },
          skip: 20,
        }),
      );
    });
  });

  describe('getUser', () => {
    it('인증·계정과 자산·활동 정보를 내려준다', async () => {
      user.findFirst.mockResolvedValue(userOf());
      account.findUnique.mockResolvedValue({
        id: 10,
        cash: 2_438_771n,
        lockedCash: 93_093n,
      });
      holding.count.mockResolvedValue(3);
      order.count.mockResolvedValue(2);

      const result = await service.getUser(6);

      expect(user.findFirst).toHaveBeenCalledWith({
        where: { id: 6, role: Role.USER },
      });
      expect(order.count).toHaveBeenCalledWith({
        where: {
          accountId: 10,
          status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
        },
      });
      expect(result).toMatchObject({
        userId: 6,
        email: 'su*******@mail.com',
        security: {
          emailVerified: true,
          twoFactorStatus: TwoFactorStatus.ENABLED,
          twoFactorPhoneNumber: '010-****-1234',
          twoFactorVerifiedDate: new Date('2026-09-06T10:42:00Z'),
          loginFailCount: 0,
        },
        asset: {
          availableCash: 2_345_678,
          lockedCash: 93_093,
          holdingCount: 3,
          openOrderCount: 2,
        },
      });
    });

    it('2차 보안 번호가 없으면 null로 내려준다', async () => {
      user.findFirst.mockResolvedValue(
        userOf({
          twoFactorStatus: TwoFactorStatus.NOT_SET,
          twoFactorPhoneNumber: null,
        }),
      );
      account.findUnique.mockResolvedValue(null);

      await expect(service.getUser(6)).resolves.toMatchObject({
        security: { twoFactorPhoneNumber: null },
        asset: { availableCash: 0, lockedCash: 0, holdingCount: 0 },
      });
    });

    it('없거나 관리자 계정이면 404', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(service.getUser(1)).rejects.toMatchObject({
        response: { code: 'USER_NOT_FOUND' },
      });
    });
  });

  describe('changeStatus', () => {
    it('정지로 바꾸면 세션을 만료하고 활동 이력을 같은 트랜잭션에 남긴다', async () => {
      user.findFirst.mockResolvedValue(userOf());

      await expect(
        service.changeStatus(6, UserStatus.BLOCKED, action),
      ).resolves.toEqual({
        userId: 6,
        statusBefore: UserStatus.ACTIVE,
        statusAfter: UserStatus.BLOCKED,
      });
      expect(user.updateMany).toHaveBeenCalledWith({
        where: { id: 6, userStatus: UserStatus.ACTIVE },
        data: { userStatus: UserStatus.BLOCKED },
      });
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 6, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        {
          adminId: 1,
          targetType: AdminActivityTarget.USER,
          targetId: 6,
          targetLabel: 'sunjung01',
          action: AdminActivityAction.USER_STATUS_CHANGE,
          summary: '정상 → 정지',
          before: { userStatus: UserStatus.ACTIVE },
          after: { userStatus: UserStatus.BLOCKED },
          reason: '운영정책 위반에 따른 이용 정지 처리',
          client: { ipAddress: '192.168.10.24' },
        },
        tx,
      );
    });

    it('잠금에서 정상으로 바꾸면 실패 횟수를 초기화하고 세션은 그대로 둔다', async () => {
      user.findFirst.mockResolvedValue(
        userOf({ userStatus: UserStatus.LOCKED, loginFailCount: 5 }),
      );

      await service.changeStatus(6, UserStatus.ACTIVE, action);

      expect(user.updateMany).toHaveBeenCalledWith({
        where: { id: 6, userStatus: UserStatus.LOCKED },
        data: { userStatus: UserStatus.ACTIVE, loginFailCount: 0 },
      });
      expect(refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('정지에서 정상으로 바꾸면 실패 횟수는 건드리지 않는다', async () => {
      user.findFirst.mockResolvedValue(
        userOf({ userStatus: UserStatus.BLOCKED }),
      );

      await service.changeStatus(6, UserStatus.ACTIVE, action);

      expect(user.updateMany).toHaveBeenCalledWith({
        where: { id: 6, userStatus: UserStatus.BLOCKED },
        data: { userStatus: UserStatus.ACTIVE },
      });
    });

    it('이상 거래에서 넘어온 정지면 그 회원의 것인지 확인하고 같은 트랜잭션에서 처리완료한다', async () => {
      const anomaly = { id: 7, userId: 6 };
      anomalies.assertActionable.mockResolvedValue(anomaly);
      user.findFirst.mockResolvedValue(userOf());

      await service.changeStatus(6, UserStatus.BLOCKED, action, 7);

      expect(anomalies.assertActionable).toHaveBeenCalledWith(7, {
        action: AnomalyAction.USER_BLOCK,
        userId: 6,
        userStatus: UserStatus.BLOCKED,
      });
      expect(anomalies.resolve).toHaveBeenCalledWith(
        tx,
        anomaly,
        AnomalyAction.USER_BLOCK,
        '운영정책 위반에 따른 이용 정지 처리',
        action,
      );
    });

    it('이상 거래 확인에 실패하면 상태를 바꾸지 않는다', async () => {
      anomalies.assertActionable.mockRejectedValue(
        Object.assign(new Error(), {
          response: { code: 'ANOMALY_INVALID_ACTION' },
        }),
      );
      user.findFirst.mockResolvedValue(userOf());

      await expect(
        service.changeStatus(6, UserStatus.LOCKED, action, 7),
      ).rejects.toMatchObject({ response: { code: 'ANOMALY_INVALID_ACTION' } });
      expect(user.updateMany).not.toHaveBeenCalled();
    });

    it('현재 상태와 같으면 400', async () => {
      user.findFirst.mockResolvedValue(userOf());

      await expect(
        service.changeStatus(6, UserStatus.ACTIVE, action),
      ).rejects.toMatchObject({ response: { code: 'USER_STATUS_UNCHANGED' } });
      expect(user.updateMany).not.toHaveBeenCalled();
    });

    it('그사이 상태가 바뀌었으면 409이고 이력을 남기지 않는다', async () => {
      user.findFirst.mockResolvedValue(userOf());
      user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.changeStatus(6, UserStatus.BLOCKED, action),
      ).rejects.toMatchObject({ response: { code: 'USER_STATUS_CONFLICT' } });
      expect(adminActivityLogs.record).not.toHaveBeenCalled();
    });
  });

  describe('unlock', () => {
    it('잠금을 풀고 실패 횟수를 0으로 초기화한다', async () => {
      user.findFirst.mockResolvedValue(
        userOf({ userStatus: UserStatus.LOCKED, loginFailCount: 5 }),
      );

      await expect(
        service.unlock(6, { ...action, reason: '본인 확인 완료' }),
      ).resolves.toEqual({
        userId: 6,
        statusBefore: UserStatus.LOCKED,
        statusAfter: UserStatus.ACTIVE,
      });
      expect(user.updateMany).toHaveBeenCalledWith({
        where: { id: 6, userStatus: UserStatus.LOCKED },
        data: { userStatus: UserStatus.ACTIVE, loginFailCount: 0 },
      });
      expect(adminActivityLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AdminActivityAction.USER_UNLOCK,
          summary: '잠금 → 정상',
          before: { userStatus: UserStatus.LOCKED, loginFailCount: 5 },
          after: { userStatus: UserStatus.ACTIVE, loginFailCount: 0 },
          reason: '본인 확인 완료',
        }),
        tx,
      );
    });

    it('잠금 상태가 아니면 409', async () => {
      user.findFirst.mockResolvedValue(
        userOf({ userStatus: UserStatus.BLOCKED }),
      );

      await expect(service.unlock(6, action)).rejects.toMatchObject({
        response: { code: 'USER_NOT_LOCKED' },
      });
      expect(user.updateMany).not.toHaveBeenCalled();
    });
  });
});
