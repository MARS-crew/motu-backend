import { verify } from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Prisma,
  TwoFactorStatus,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const tx = { user: { create: vi.fn(), update: vi.fn() } };
  const countUsers = vi.fn();
  const createInitialAccount = vi.fn();
  const sendEmailCode = vi.fn();
  const consumeVerified = vi.fn();
  const updateUser = vi.fn();
  const updateManyUsers = vi.fn();
  const findUniqueUser = vi.fn();
  const sendSmsCode = vi.fn();
  const confirmSmsCode = vi.fn();
  const invalidateOthers = vi.fn();
  const prisma = {
    user: {
      findUnique: findUniqueUser,
      count: countUsers,
      update: updateUser,
      updateMany: updateManyUsers,
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const accountsService = {
    createInitialAccount,
  } as unknown as AccountsService;
  const verificationsService = {
    sendEmailCode,
    consumeVerified,
    sendSmsCode,
    confirmSmsCode,
    invalidateOthers,
  } as unknown as VerificationsService;
  const service = new UsersService(
    prisma,
    accountsService,
    verificationsService,
  );

  const dto: CreateUserReqDto = {
    loginId: 'motu01',
    password: 'motu1234!',
    nickname: '모투투자',
    email: 'name@example.com',
    birthDate: '2000-01-01',
    termsAgreed: true,
    privacyAgreed: true,
    marketingAgreed: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    countUsers.mockResolvedValue(0);
    tx.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 1, userStatus: 'ACTIVE', role: 'USER', ...data }),
    );
    createInitialAccount.mockResolvedValue({
      cash: 3_000_000n,
    } as never);
  });

  it('비밀번호를 해시해 저장하고 계좌를 만든다', async () => {
    const result = await service.create(dto);

    const saved = tx.user.create.mock.calls[0][0].data;
    expect(saved.password).not.toBe(dto.password);
    expect(await verify(saved.password, dto.password)).toBe(true);
    expect(consumeVerified).toHaveBeenCalledWith(
      tx,
      'EMAIL',
      'SIGNUP',
      dto.email,
    );
    expect(createInitialAccount).toHaveBeenCalledWith(tx, 1);
    expect(result).toEqual({
      userId: 1,
      loginId: 'motu01',
      nickname: '모투투자',
      userStatus: 'ACTIVE',
      role: 'USER',
      cash: 3_000_000,
    });
  });

  it('이미 사용 중인 아이디면 가입하지 않는다', async () => {
    countUsers.mockResolvedValueOnce(1);

    await expect(service.create(dto)).rejects.toMatchObject({
      response: { code: 'LOGIN_ID_DUPLICATED' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('동시 가입으로 UNIQUE 제약에 걸리면 중복 필드를 알려준다', async () => {
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'users_nickname_key' } },
          },
        },
      }),
    );

    await expect(service.create(dto)).rejects.toMatchObject({
      status: 409,
      response: { code: 'NICKNAME_DUPLICATED' },
    });
  });

  it('이미 가입된 이메일로는 인증번호를 보내지 않는다', async () => {
    countUsers.mockResolvedValue(1);

    await expect(service.sendSignupEmailCode(dto.email)).rejects.toMatchObject({
      response: { code: 'EMAIL_DUPLICATED' },
    });
    expect(sendEmailCode).not.toHaveBeenCalled();
  });

  describe('닉네임 변경', () => {
    const user = {
      id: 6,
      loginId: 'motuuser',
      nickname: '모투테스터',
      email: 'user@motu.test',
      phoneNumber: null,
      role: 'USER',
      userStatus: 'ACTIVE',
      twoFactorStatus: TwoFactorStatus.NOT_SET,
    };
    const nickname = '새닉네임';

    it('사용 가능한 닉네임으로 변경하고 회원 정보를 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce(user);
      updateUser.mockResolvedValueOnce({ ...user, nickname });

      await expect(service.changeNickname(user.id, nickname)).resolves.toEqual({
        userId: user.id,
        loginId: user.loginId,
        nickname,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        userStatus: user.userStatus,
        twoFactorStatus: user.twoFactorStatus,
      });
      expect(countUsers).toHaveBeenCalledWith({ where: { nickname } });
      expect(updateUser).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { nickname },
      });
    });

    it('현재 닉네임이면 읽어 온 회원 정보를 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce(user);

      await expect(
        service.changeNickname(user.id, user.nickname),
      ).resolves.toMatchObject({
        userId: user.id,
        nickname: user.nickname,
      });
      expect(countUsers).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('다른 회원이 사용 중인 닉네임이면 저장 전에 409를 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce(user);
      countUsers.mockResolvedValueOnce(1);

      await expect(
        service.changeNickname(user.id, nickname),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'NICKNAME_DUPLICATED' },
      });
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('다른 회원이 먼저 저장해 P2002가 발생하면 409를 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce(user);
      updateUser.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            driverAdapterError: {
              cause: { constraint: { index: 'users_nickname_key' } },
            },
          },
        }),
      );

      await expect(
        service.changeNickname(user.id, nickname),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'NICKNAME_DUPLICATED' },
      });
    });

    it('회원이 없으면 저장 전에 404를 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce(null);

      await expect(
        service.changeNickname(user.id, nickname),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'USER_NOT_FOUND' },
      });
      expect(countUsers).not.toHaveBeenCalled();
      expect(updateUser).not.toHaveBeenCalled();
    });
  });

  describe('recordLoginFailure', () => {
    it('4회째 실패까지는 잠그지 않는다', async () => {
      updateUser.mockResolvedValue({ loginFailCount: 4 });

      await expect(service.recordLoginFailure(1)).resolves.toEqual({
        failCount: 4,
        locked: false,
      });
      expect(updateManyUsers).not.toHaveBeenCalled();
    });

    it('5회째 실패하면 정상 상태인 계정을 잠근다', async () => {
      updateUser.mockResolvedValue({ loginFailCount: 5 });

      await expect(service.recordLoginFailure(1)).resolves.toEqual({
        failCount: 5,
        locked: true,
      });
      expect(updateManyUsers).toHaveBeenCalledWith({
        where: { id: 1, userStatus: 'ACTIVE' },
        data: { userStatus: 'LOCKED' },
      });
    });
  });

  describe('연락처 변경', () => {
    const userOf = (overrides: Record<string, unknown> = {}) => ({
      id: 6,
      loginId: 'motuuser',
      nickname: '모투테스터',
      email: 'user@motu.test',
      phoneNumber: '01012345678',
      role: 'USER',
      userStatus: 'ACTIVE',
      twoFactorStatus: TwoFactorStatus.ENABLED,
      ...overrides,
    });
    const sent = {
      expiresAt: new Date('2026-11-16T07:05:00Z'),
      resendAvailableAt: new Date('2026-11-16T07:00:30Z'),
    };

    it('2차 보안 설정 회원이면 새 번호로 인증번호를 보내고 다른 번호의 인증번호를 무효로 한다', async () => {
      findUniqueUser.mockResolvedValue(userOf());
      sendSmsCode.mockResolvedValue(sent);

      await expect(
        service.sendContactPhoneCode(6, '01045678901'),
      ).resolves.toEqual({ maskedPhoneNumber: '010-****-8901', ...sent });
      expect(sendSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        '01045678901',
        '6:01045678901',
      );
      expect(invalidateOthers).toHaveBeenCalledWith(
        VerificationChannel.SMS,
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        '6:',
        '6:01045678901',
      );
    });

    it.each([TwoFactorStatus.NOT_SET, TwoFactorStatus.DISABLED])(
      '2차 보안이 %s이면 403',
      async (twoFactorStatus) => {
        findUniqueUser.mockResolvedValue(userOf({ twoFactorStatus }));

        await expect(
          service.sendContactPhoneCode(6, '01045678901'),
        ).rejects.toMatchObject({
          response: { code: 'USER_CONTACT_TWO_FACTOR_REQUIRED' },
        });
        expect(sendSmsCode).not.toHaveBeenCalled();
      },
    );

    it('현재 연락처와 같은 번호면 409', async () => {
      findUniqueUser.mockResolvedValue(userOf());

      await expect(
        service.sendContactPhoneCode(6, '01012345678'),
      ).rejects.toMatchObject({ response: { code: 'USER_SAME_PHONE_NUMBER' } });
    });

    it('인증번호가 맞으면 연락처만 바꾸고 바뀐 내 정보를 내려준다', async () => {
      findUniqueUser
        .mockResolvedValueOnce(userOf())
        .mockResolvedValueOnce(userOf({ phoneNumber: '01045678901' }));

      const result = await service.changeContactPhone(
        6,
        '01045678901',
        '135790',
      );

      expect(confirmSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        '6:01045678901',
        '135790',
      );
      expect(consumeVerified).toHaveBeenCalledWith(
        tx,
        VerificationChannel.SMS,
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        '6:01045678901',
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { phoneNumber: '01045678901' },
      });
      expect(result).toMatchObject({
        phoneNumber: '01045678901',
        twoFactorStatus: TwoFactorStatus.ENABLED,
      });
    });

    it('인증번호가 틀리면 연락처를 바꾸지 않는다', async () => {
      findUniqueUser.mockResolvedValue(userOf());
      confirmSmsCode.mockRejectedValueOnce(
        new Error('VERIFICATION_CODE_MISMATCH'),
      );

      await expect(
        service.changeContactPhone(6, '01045678901', '000000'),
      ).rejects.toThrow('VERIFICATION_CODE_MISMATCH');
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });
});
