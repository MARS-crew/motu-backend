import { ValidationPipe } from '@nestjs/common';
import { hash, verify } from 'argon2';
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
import { UpdateMyInfoReqDto } from './dto/req/update-my-info-req.dto.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const tx = {
    user: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    passwordResetToken: { updateMany: vi.fn() },
    trustedDevice: { deleteMany: vi.fn() },
  };
  const countUsers = vi.fn();
  const createInitialAccount = vi.fn();
  const sendEmailCode = vi.fn();
  const consumeVerified = vi.fn();
  const updateUser = vi.fn();
  const updateManyUsers = vi.fn();
  const findUniqueUser = vi.fn();
  const sendSmsCode = vi.fn();
  const confirmSmsCode = vi.fn();
  const confirmEmailCode = vi.fn();
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
    confirmEmailCode,
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
    tx.user.updateMany.mockResolvedValue({ count: 1 });
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

  it('가입 완료 cash는 고정 상수 대신 실제 계좌 지급액이다', async () => {
    createInitialAccount.mockResolvedValueOnce({ cash: 5_000_000n });
    expect((await service.create(dto)).cash).toBe(5_000_000);
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

  describe('내 정보 조회', () => {
    const user = {
      id: 6,
      loginId: 'motuuser',
      nickname: '모투테스터',
      email: 'user@motu.test',
      phoneNumber: null,
      role: 'USER',
      userStatus: 'ACTIVE',
      twoFactorStatus: TwoFactorStatus.NOT_SET,
      adminProfile: null,
    };

    it('회원은 닉네임을 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce(user);

      await expect(service.getMyInfo(user.id)).resolves.toMatchObject({
        nickname: '모투테스터',
      });
      expect(findUniqueUser).toHaveBeenCalledWith({
        where: { id: user.id },
        include: { adminProfile: { select: { name: true } } },
      });
    });

    it('생성 API로 만든 관리자는 닉네임이 없어도 관리자명을 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce({
        ...user,
        role: 'ADMIN',
        nickname: null,
        adminProfile: { name: '김관리' },
      });

      await expect(service.getMyInfo(user.id)).resolves.toMatchObject({
        nickname: '김관리',
        role: 'ADMIN',
      });
    });

    it('탈퇴 회원은 404를 반환한다', async () => {
      findUniqueUser.mockResolvedValueOnce({
        ...user,
        nickname: null,
        email: null,
        userStatus: 'WITHDRAWN',
      });

      await expect(service.getMyInfo(user.id)).rejects.toMatchObject({
        response: { code: 'USER_NOT_FOUND' },
      });
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
        await expect(
          service.confirmContactPhoneCode(6, '01045678901', '135790'),
        ).rejects.toMatchObject({
          response: { code: 'USER_CONTACT_TWO_FACTOR_REQUIRED' },
        });
        await expect(
          service.changeContactPhone(6, '01045678901'),
        ).rejects.toMatchObject({
          response: { code: 'USER_CONTACT_TWO_FACTOR_REQUIRED' },
        });
        expect(sendSmsCode).not.toHaveBeenCalled();
        expect(confirmSmsCode).not.toHaveBeenCalled();
        expect(consumeVerified).not.toHaveBeenCalled();
      },
    );

    it('현재 연락처와 같은 번호면 409', async () => {
      findUniqueUser.mockResolvedValue(userOf());

      await expect(
        service.sendContactPhoneCode(6, '01012345678'),
      ).rejects.toMatchObject({ response: { code: 'USER_SAME_PHONE_NUMBER' } });
    });

    it('확인 단계에서는 연락처를 저장하거나 인증을 소비하지 않는다', async () => {
      findUniqueUser.mockResolvedValueOnce(userOf());

      await expect(
        service.confirmContactPhoneCode(6, '01045678901', '135790'),
      ).resolves.toEqual({ verified: true });

      expect(confirmSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        '6:01045678901',
        '135790',
      );
      expect(consumeVerified).not.toHaveBeenCalled();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('저장할 때 인증 완료 결과가 없으면 연락처를 변경하지 않는다', async () => {
      findUniqueUser.mockResolvedValueOnce(userOf());
      consumeVerified.mockRejectedValueOnce(new Error('VERIFICATION_REQUIRED'));

      await expect(
        service.changeContactPhone(6, '01045678901'),
      ).rejects.toThrow('VERIFICATION_REQUIRED');
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('인증한 번호를 저장하면 연락처만 바꾸고 바뀐 내 정보를 내려준다', async () => {
      findUniqueUser
        .mockResolvedValueOnce(userOf())
        .mockResolvedValueOnce(userOf({ phoneNumber: '01045678901' }));

      const result = await service.changeContactPhone(6, '01045678901');

      expect(confirmSmsCode).not.toHaveBeenCalled();
      expect(consumeVerified).toHaveBeenCalledWith(
        tx,
        VerificationChannel.SMS,
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        '6:01045678901',
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 6,
          userStatus: 'ACTIVE',
          twoFactorStatus: TwoFactorStatus.ENABLED,
          phoneNumber: '01012345678',
        },
        data: { phoneNumber: '01045678901' },
      });
      expect(result).toMatchObject({
        phoneNumber: '01045678901',
        twoFactorStatus: TwoFactorStatus.ENABLED,
      });
    });

    it('인증 중 2차 보안이 해제되면 연락처 변경을 거부한다', async () => {
      findUniqueUser.mockResolvedValueOnce(userOf());
      tx.user.updateMany.mockResolvedValueOnce({ count: 0 });
      tx.user.findUnique.mockResolvedValueOnce(
        userOf({ twoFactorStatus: TwoFactorStatus.DISABLED }),
      );

      await expect(
        service.changeContactPhone(6, '01045678901'),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'USER_CONTACT_TWO_FACTOR_REQUIRED' },
      });
    });

    it('인증번호가 틀리면 연락처를 바꾸지 않는다', async () => {
      findUniqueUser.mockResolvedValue(userOf());
      confirmSmsCode.mockRejectedValueOnce(
        new Error('VERIFICATION_CODE_MISMATCH'),
      );

      await expect(
        service.confirmContactPhoneCode(6, '01045678901', '000000'),
      ).rejects.toThrow('VERIFICATION_CODE_MISMATCH');
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });
  });
  describe('회원정보 수정 이메일 인증', () => {
    const user = {
      id: 6,
      loginId: 'motuuser',
      nickname: '모투테스터',
      email: 'user@motu.test',
      birthDate: new Date('2000-01-01'),
      phoneNumber: null,
      role: 'USER',
      userStatus: 'ACTIVE',
      twoFactorStatus: TwoFactorStatus.NOT_SET,
    };
    const sent = {
      expiresAt: new Date('2026-11-21T03:05:00Z'),
      resendAvailableAt: new Date('2026-11-21T03:00:30Z'),
    };

    it('가입 이메일이면 회원별 구분 값으로 인증번호를 보낸다', async () => {
      findUniqueUser.mockResolvedValue(user);
      sendEmailCode.mockResolvedValue(sent);

      await expect(
        service.sendProfileEmailCode(user.id, user.email),
      ).resolves.toEqual(sent);
      expect(sendEmailCode).toHaveBeenCalledWith(
        VerificationPurpose.PROFILE_UPDATE,
        user.email,
        `${user.id}:${user.email}`,
      );
    });

    it('가입 이메일과 다르면 보내지 않는다', async () => {
      findUniqueUser.mockResolvedValue(user);

      await expect(
        service.sendProfileEmailCode(user.id, 'other@motu.test'),
      ).rejects.toMatchObject({ response: { code: 'USER_EMAIL_MISMATCH' } });
      expect(sendEmailCode).not.toHaveBeenCalled();
    });

    it('탈퇴 회원은 보내지 않는다', async () => {
      findUniqueUser.mockResolvedValue({
        ...user,
        email: null,
        userStatus: 'WITHDRAWN',
      });

      await expect(
        service.sendProfileEmailCode(user.id, user.email),
      ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
      expect(sendEmailCode).not.toHaveBeenCalled();
    });

    it('인증번호가 맞으면 수정 가능 시각을 알려준다', async () => {
      findUniqueUser.mockResolvedValue(user);
      const before = Date.now();

      const result = await service.confirmProfileEmailCode(
        user.id,
        user.email,
        '123456',
      );

      expect(confirmEmailCode).toHaveBeenCalledWith(
        VerificationPurpose.PROFILE_UPDATE,
        `${user.id}:${user.email}`,
        '123456',
      );
      expect(result.verified).toBe(true);
      expect(result.editableUntil.getTime()).toBeGreaterThanOrEqual(
        before + 30 * 60 * 1000,
      );
    });
  });

  describe('회원정보 수정', () => {
    let user: Record<string, unknown>;

    beforeAll(async () => {
      user = {
        id: 6,
        loginId: 'motuuser',
        password: await hash('motuuser1!'),
        nickname: '모투테스터',
        email: 'user@motu.test',
        birthDate: new Date('2000-01-01'),
        phoneNumber: null,
        role: 'USER',
        userStatus: 'ACTIVE',
        twoFactorStatus: TwoFactorStatus.NOT_SET,
      };
    });

    beforeEach(() => {
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      countUsers.mockResolvedValue(0);
    });

    it('바꿀 항목이 없으면 거부한다', async () => {
      await expect(service.updateMyInfo(6, {})).rejects.toMatchObject({
        response: { code: 'USER_NOTHING_TO_UPDATE' },
      });
      expect(findUniqueUser).not.toHaveBeenCalled();
    });

    it('생년월일을 바꾸고 인증 결과를 사용 처리한다', async () => {
      findUniqueUser.mockResolvedValueOnce(user).mockResolvedValueOnce({
        ...user,
        birthDate: new Date('1999-12-31'),
      });

      const result = await service.updateMyInfo(6, {
        birthDate: '1999-12-31',
      });

      expect(consumeVerified).toHaveBeenCalledWith(
        tx,
        VerificationChannel.EMAIL,
        VerificationPurpose.PROFILE_UPDATE,
        '6:user@motu.test',
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 6,
          email: 'user@motu.test',
          userStatus: { not: 'WITHDRAWN' },
        },
        data: { birthDate: new Date('1999-12-31') },
      });
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        nickname: '모투테스터',
        birthDate: '1999-12-31',
        reloginRequired: false,
      });
    });

    it('비밀번호를 바꾸면 모든 기기에서 로그아웃하고 신뢰 기기를 지운다', async () => {
      findUniqueUser.mockResolvedValue(user);

      const result = await service.updateMyInfo(6, { password: 'motunew1!' });

      const { data } = tx.user.updateMany.mock.calls[0][0] as {
        data: { password: string };
      };
      expect(await verify(data.password, 'motunew1!')).toBe(true);
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 6, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 6, usedAt: null },
        data: { usedAt: expect.any(Date) as Date },
      });
      expect(tx.trustedDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId: 6 },
      });
      expect(result.reloginRequired).toBe(true);
    });

    it('현재 비밀번호와 같으면 거부한다', async () => {
      findUniqueUser.mockResolvedValue(user);

      await expect(
        service.updateMyInfo(6, { password: 'motuuser1!' }),
      ).rejects.toMatchObject({ response: { code: 'USER_SAME_PASSWORD' } });
      expect(consumeVerified).not.toHaveBeenCalled();
    });

    it('이메일 인증을 하지 않았으면 바꾸지 않는다', async () => {
      findUniqueUser.mockResolvedValue(user);
      consumeVerified.mockRejectedValueOnce(new Error('VERIFICATION_REQUIRED'));

      await expect(
        service.updateMyInfo(6, { birthDate: '2000-01-02' }),
      ).rejects.toThrow('VERIFICATION_REQUIRED');
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('nickname is rejected by the profile request DTO even when another field is valid', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      await expect(
        pipe.transform(
          { nickname: 'newname', birthDate: '2000-01-02' },
          { type: 'body', metatype: UpdateMyInfoReqDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
