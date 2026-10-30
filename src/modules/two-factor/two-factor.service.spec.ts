import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  TwoFactorStatus,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { VerificationErrors } from '../verifications/verifications.errors.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { TwoFactorAction } from './two-factor.constants.js';
import { TwoFactorService } from './two-factor.service.js';

const PHONE = '01012344821';
const MINUTE = 60_000;

describe('TwoFactorService', () => {
  const user = {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const twoFactorHistory = { create: vi.fn() };
  const trustedDevice = { updateMany: vi.fn(), upsert: vi.fn() };
  const prisma = {
    user,
    twoFactorHistory,
    trustedDevice,
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as unknown[]),
    ),
  } as unknown as PrismaService;
  const verifications = {
    sendSmsCode: vi.fn(),
    sendEmailCode: vi.fn(),
    confirmSmsCode: vi.fn(),
    confirmEmailCode: vi.fn(),
    consumeVerified: vi.fn(),
    invalidatePending: vi.fn(),
    invalidateOthers: vi.fn(),
  };
  const service = new TwoFactorService(
    prisma,
    verifications as unknown as VerificationsService,
  );

  const member = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    email: 'kimmt1234@gmail.com',
    twoFactorStatus: TwoFactorStatus.NOT_SET,
    twoFactorPhoneNumber: null,
    twoFactorEnabledDate: null,
    twoFactorVerifiedDate: null,
    twoFactorLockedUntil: null,
    twoFactorFailCount: 0,
    orderActivatedDate: null,
    ...overrides,
  });
  const enabled = (overrides: Record<string, unknown> = {}) =>
    member({
      twoFactorStatus: TwoFactorStatus.ENABLED,
      twoFactorPhoneNumber: PHONE,
      twoFactorEnabledDate: new Date(),
      ...overrides,
    });
  const mismatch = () =>
    new BusinessException(VerificationErrors.CODE_MISMATCH);

  beforeEach(() => {
    vi.clearAllMocks();
    user.findUnique.mockResolvedValue(member());
    user.update.mockResolvedValue({});
    verifications.confirmSmsCode.mockResolvedValue(undefined);
    verifications.sendSmsCode.mockResolvedValue({
      expiresAt: new Date(),
      resendAvailableAt: new Date(),
    });
  });

  describe('sendPhoneVerification', () => {
    it('미설정 계정은 입력한 번호로 인증번호를 보낸다 (회원별로 구분)', async () => {
      const result = await service.sendPhoneVerification(1, PHONE);

      expect(verifications.sendSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.TWO_FACTOR_SETUP,
        PHONE,
        `1:${PHONE}`,
      );
      expect(result).toMatchObject({
        maskedPhoneNumber: '010-****-4821',
        remainingAttempts: 5,
      });
      // 다른 번호로 받아 둔 인증번호는 무효로 한다.
      expect(verifications.invalidateOthers).toHaveBeenCalledWith(
        VerificationChannel.SMS,
        VerificationPurpose.TWO_FACTOR_SETUP,
        '1:',
        `1:${PHONE}`,
      );
    });

    it('남은 입력 횟수는 연속 실패 횟수를 뺀 값이다', async () => {
      user.findUnique.mockResolvedValue(member({ twoFactorFailCount: 2 }));

      const result = await service.sendPhoneVerification(1, PHONE);

      expect(result.remainingAttempts).toBe(3);
    });

    it('설정 계정이 번호를 바꾸려면 최근 재인증이 필요하다', async () => {
      user.findUnique.mockResolvedValue(enabled());

      await expect(
        service.sendPhoneVerification(1, '01099998888'),
      ).rejects.toMatchObject({
        status: 403,
        response: {
          code: 'TWO_FACTOR_REQUIRED',
          details: { action: TwoFactorAction.PHONE_CHANGE },
        },
      });
      expect(verifications.sendSmsCode).not.toHaveBeenCalled();
    });

    it('10분 안에 재인증했으면 새 번호로 보낸다', async () => {
      user.findUnique.mockResolvedValue(
        enabled({ twoFactorVerifiedDate: new Date(Date.now() - 9 * MINUTE) }),
      );

      await service.sendPhoneVerification(1, '01099998888');

      expect(verifications.sendSmsCode).toHaveBeenCalled();
    });

    it('이미 등록된 번호는 다시 등록하지 않는다', async () => {
      user.findUnique.mockResolvedValue(enabled());

      await expect(
        service.sendPhoneVerification(1, PHONE),
      ).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_SAME_PHONE_NUMBER' },
      });
    });

    it('SMS 인증 제한 중이면 보내지 않는다', async () => {
      const lockedUntil = new Date(Date.now() + 10 * MINUTE);
      user.findUnique.mockResolvedValue(
        member({ twoFactorLockedUntil: lockedUntil }),
      );

      await expect(
        service.sendPhoneVerification(1, PHONE),
      ).rejects.toMatchObject({
        status: 429,
        response: { code: 'TWO_FACTOR_LOCKED', details: { lockedUntil } },
      });
    });
  });

  describe('confirmPhoneVerification', () => {
    it('인증번호가 맞으면 2차 보안을 설정하고 이력을 남긴다', async () => {
      await service.confirmPhoneVerification(1, PHONE, '123456', {
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      expect(verifications.confirmSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.TWO_FACTOR_SETUP,
        `1:${PHONE}`,
        '123456',
      );
      expect(verifications.consumeVerified).toHaveBeenCalledWith(
        prisma,
        VerificationChannel.SMS,
        VerificationPurpose.TWO_FACTOR_SETUP,
        `1:${PHONE}`,
      );
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          twoFactorStatus: TwoFactorStatus.ENABLED,
          twoFactorPhoneNumber: PHONE,
          twoFactorVerifiedDate: expect.any(Date),
        }),
      });
      expect(twoFactorHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          action: 'ENABLED',
          phoneNumber: PHONE,
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
        }),
      });
    });

    it('설정 계정이 다른 번호로 인증하면 번호 변경 이력을 남긴다', async () => {
      user.findUnique.mockResolvedValue(enabled());

      await service.confirmPhoneVerification(1, '01099998888', '123456', {});

      expect(twoFactorHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'PHONE_CHANGED' }),
      });
    });

    it('틀리면 연속 실패 횟수를 올리고 남은 횟수를 알려준다', async () => {
      verifications.confirmSmsCode.mockRejectedValue(mismatch());
      user.update.mockResolvedValue({ twoFactorFailCount: 2 });

      await expect(
        service.confirmPhoneVerification(1, PHONE, '000000', {}),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          code: 'VERIFICATION_CODE_MISMATCH',
          details: { remainingAttempts: 3 },
        },
      });
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { twoFactorFailCount: { increment: 1 } },
        select: { twoFactorFailCount: true },
      });
      expect(twoFactorHistory.create).not.toHaveBeenCalled();
    });

    it('5회 연속 틀리면 30분 동안 제한하고 남은 인증번호를 무효로 한다', async () => {
      verifications.confirmSmsCode.mockRejectedValue(mismatch());
      user.update.mockResolvedValueOnce({ twoFactorFailCount: 5 });

      const error = await service
        .confirmPhoneVerification(1, PHONE, '000000', {})
        .catch((e: unknown) => e);

      expect(error).toMatchObject({
        status: 429,
        response: { code: 'TWO_FACTOR_LOCKED' },
      });
      const lockUpdate = user.update.mock.calls[1][0] as {
        data: { twoFactorFailCount: number; twoFactorLockedUntil: Date };
      };
      expect(lockUpdate.data.twoFactorFailCount).toBe(0);
      expect(
        lockUpdate.data.twoFactorLockedUntil.getTime() - Date.now(),
      ).toBeGreaterThan(29 * MINUTE);
      expect(verifications.invalidatePending).toHaveBeenCalledWith(
        VerificationChannel.SMS,
        VerificationPurpose.TWO_FACTOR_SETUP,
        `1:${PHONE}`,
      );
    });

    it('성공하면 연속 실패 횟수를 0으로 되돌린다', async () => {
      user.findUnique.mockResolvedValue(member({ twoFactorFailCount: 3 }));

      await service.confirmPhoneVerification(1, PHONE, '123456', {});

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { twoFactorFailCount: 0 },
      });
    });
  });

  describe('disable', () => {
    it('해제하고 회원, 일시, 접속 정보를 이력에 남긴다', async () => {
      user.findUnique.mockResolvedValue(enabled());

      await service.disable(1, { ipAddress: '1.2.3.4', userAgent: 'UA' });

      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          twoFactorStatus: TwoFactorStatus.DISABLED,
          twoFactorPhoneNumber: null,
        }),
      });
      expect(twoFactorHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          action: 'DISABLED',
          ipAddress: '1.2.3.4',
          userAgent: 'UA',
          createDate: expect.any(Date),
        }),
      });
    });

    it('설정하지 않은 계정은 해제할 수 없다', async () => {
      await expect(service.disable(1, {})).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_NOT_ENABLED' },
      });
    });
  });

  describe('재인증', () => {
    it('미설정 계정에는 SMS를 보내지 않는다', async () => {
      await expect(service.sendVerification(1)).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_NOT_ENABLED' },
      });
      expect(verifications.sendSmsCode).not.toHaveBeenCalled();
    });

    it('등록 휴대폰으로 보내고, 맞으면 10분 동안 유효하다', async () => {
      user.findUnique.mockResolvedValue(enabled());

      await service.sendVerification(1);
      const { verifiedUntil } = await service.confirmVerification(1, '123456');

      expect(verifications.sendSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.TWO_FACTOR,
        PHONE,
        `1:${PHONE}`,
      );
      expect(verifiedUntil.getTime() - Date.now()).toBeGreaterThan(9 * MINUTE);
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { twoFactorVerifiedDate: expect.any(Date) },
      });
    });

    it.each([
      ['재인증한 적 없음', null, 'TWO_FACTOR_REQUIRED'],
      ['10분 지남', new Date(Date.now() - 11 * MINUTE), 'TWO_FACTOR_REQUIRED'],
    ])('requireVerification: %s → %s', async (_case, verifiedDate, code) => {
      user.findUnique.mockResolvedValue(
        enabled({ twoFactorVerifiedDate: verifiedDate }),
      );

      await expect(
        service.requireVerification(1, TwoFactorAction.LISTING_SUBMIT),
      ).rejects.toMatchObject({
        response: { code, details: { action: 'LISTING_SUBMIT' } },
      });
    });

    it('requireVerification: 미설정 계정은 설정부터 안내한다', async () => {
      await expect(
        service.requireVerification(1, TwoFactorAction.LISTING_SUBMIT),
      ).rejects.toMatchObject({
        response: { code: 'TWO_FACTOR_NOT_ENABLED' },
      });
    });
  });

  describe('assertOrderAllowed', () => {
    it('미설정 계정은 첫 주문도 바로 할 수 있다', async () => {
      await expect(service.assertOrderAllowed(1)).resolves.toBeUndefined();
    });

    it('이미 주문한 적이 있으면 다시 묻지 않는다', async () => {
      user.findUnique.mockResolvedValue(
        enabled({ orderActivatedDate: new Date() }),
      );

      await expect(service.assertOrderAllowed(1)).resolves.toBeUndefined();
    });

    it('설정 계정의 첫 주문은 재인증이 필요하다', async () => {
      user.findUnique.mockResolvedValue(enabled());

      await expect(service.assertOrderAllowed(1)).rejects.toMatchObject({
        response: {
          code: 'TWO_FACTOR_REQUIRED',
          details: { action: 'ORDER_ACTIVATION' },
        },
      });
    });

    it('설정 계정도 10분 안에 재인증했으면 주문할 수 있다', async () => {
      user.findUnique.mockResolvedValue(
        enabled({ twoFactorVerifiedDate: new Date() }),
      );

      await expect(service.assertOrderAllowed(1)).resolves.toBeUndefined();
    });
  });

  describe('새 기기 확인', () => {
    it('신뢰 기기는 30일 안에 사용한 것만 인정하고 사용 시각을 갱신한다', async () => {
      trustedDevice.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.useTrustedDevice(1, 'hash')).resolves.toBe(true);

      const { where } = trustedDevice.updateMany.mock.calls[0][0] as {
        where: { lastUsedDate: { gt: Date } };
      };
      const days = (Date.now() - where.lastUsedDate.gt.getTime()) / 86_400_000;
      expect(Math.round(days)).toBe(30);
    });

    it('미설정 계정은 가입 이메일, 설정 계정은 등록 휴대폰으로 확인한다', () => {
      expect(service.loginMethod(member())).toEqual({
        method: 'EMAIL',
        maskedTarget: 'ki*******@gmail.com',
      });
      expect(service.loginMethod(enabled())).toEqual({
        method: 'SMS',
        maskedTarget: '010-****-4821',
      });
    });

    it('미설정 계정은 회원가입 때 입력한 연락처가 있어도 이메일로 보낸다', async () => {
      verifications.sendEmailCode.mockResolvedValue({
        expiresAt: new Date(),
        resendAvailableAt: new Date(),
      });

      await service.sendLoginVerification(
        member({ phoneNumber: '01055556666' }),
      );

      expect(verifications.sendEmailCode).toHaveBeenCalledWith(
        VerificationPurpose.NEW_DEVICE_LOGIN,
        'kimmt1234@gmail.com',
        '1:kimmt1234@gmail.com',
      );
      expect(verifications.sendSmsCode).not.toHaveBeenCalled();
    });

    it('SMS로 보내면 남은 입력 횟수를, 이메일이면 null을 준다', async () => {
      verifications.sendEmailCode.mockResolvedValue({
        expiresAt: new Date(),
        resendAvailableAt: new Date(),
      });

      const sms = await service.sendLoginVerification(
        enabled({ twoFactorFailCount: 1 }),
      );
      const email = await service.sendLoginVerification(member());

      expect(sms).toMatchObject({ method: 'SMS', remainingAttempts: 4 });
      expect(email).toMatchObject({ method: 'EMAIL', remainingAttempts: null });
    });

    it('SMS로 확인하면 최근 2차 보안 인증 시각도 갱신한다', async () => {
      await service.confirmLoginVerification(enabled(), '123456');

      expect(verifications.confirmSmsCode).toHaveBeenCalledWith(
        VerificationPurpose.NEW_DEVICE_LOGIN,
        `1:${PHONE}`,
        '123456',
      );
      expect(user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { twoFactorVerifiedDate: expect.any(Date) },
      });
    });
  });
});
