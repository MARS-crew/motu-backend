import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { maskEmail, maskPhoneNumber } from '../../common/utils/masking.js';
import {
  TwoFactorAction as TwoFactorHistoryAction,
  TwoFactorStatus,
  User,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { UserErrors } from '../users/users.errors.js';
import { VerificationErrors } from '../verifications/verifications.errors.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { ConfirmTwoFactorVerificationResDto } from './dto/res/confirm-two-factor-verification-res.dto.js';
import { GetTwoFactorResDto } from './dto/res/get-two-factor-res.dto.js';
import { SendTwoFactorVerificationResDto } from './dto/res/send-two-factor-verification-res.dto.js';
import {
  LoginVerificationMethod,
  MAX_TWO_FACTOR_FAIL_COUNT,
  TRUSTED_DEVICE_TTL_MS,
  TWO_FACTOR_LOCK_MS,
  TWO_FACTOR_VERIFIED_TTL_MS,
  TwoFactorAction,
} from './two-factor.constants.js';
import { TwoFactorErrors } from './two-factor.errors.js';

/** 해제 이력 등에 남길 접속 정보 */
export interface ClientInfo {
  ipAddress?: string;
  userAgent?: string;
}

export interface SentLoginVerification {
  method: LoginVerificationMethod;
  maskedTarget: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  remainingAttempts: number | null;
}

type TwoFactorUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'twoFactorStatus'
  | 'twoFactorPhoneNumber'
  | 'twoFactorVerifiedDate'
  | 'twoFactorLockedUntil'
  | 'twoFactorFailCount'
>;

/**
 * 2차 보안(SMS) 설정·해제, 중요 기능 재인증, 새 기기 확인.
 * SMS 인증번호를 5회 연속 틀리면 30분 동안 SMS 인증만 제한한다. 계정은 잠그지 않는다.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifications: VerificationsService,
  ) {}

  async getStatus(userId: number): Promise<GetTwoFactorResDto> {
    const user = await this.findUser(userId);
    const now = Date.now();
    const verifiedUntil = this.verifiedUntil(user);
    return {
      status: user.twoFactorStatus,
      maskedPhoneNumber: user.twoFactorPhoneNumber
        ? maskPhoneNumber(user.twoFactorPhoneNumber)
        : null,
      enabledDate: user.twoFactorEnabledDate,
      lastVerifiedDate: user.twoFactorVerifiedDate,
      verifiedUntil:
        verifiedUntil && verifiedUntil.getTime() > now ? verifiedUntil : null,
      lockedUntil:
        user.twoFactorLockedUntil && user.twoFactorLockedUntil.getTime() > now
          ? user.twoFactorLockedUntil
          : null,
      remainingAttempts: this.remainingAttempts(user),
    };
  }

  /**
   * 2차 보안으로 등록할 휴대폰에 인증번호를 보낸다.
   * 이미 설정한 계정이 번호를 바꾸려면 기존 번호로 재인증을 먼저 마쳐야 한다.
   */
  async sendPhoneVerification(
    userId: number,
    phoneNumber: string,
  ): Promise<SendTwoFactorVerificationResDto> {
    const user = await this.findUser(userId);
    this.assertNotLocked(user);
    if (user.twoFactorStatus === TwoFactorStatus.ENABLED) {
      if (user.twoFactorPhoneNumber === phoneNumber) {
        throw new BusinessException(TwoFactorErrors.SAME_PHONE_NUMBER);
      }
      this.assertRecentlyVerified(user, TwoFactorAction.PHONE_CHANGE);
    }

    const target = verificationTarget(user.id, phoneNumber);
    const sent = await this.verifications.sendSmsCode(
      VerificationPurpose.TWO_FACTOR_SETUP,
      phoneNumber,
      target,
    );
    // 다른 번호로 받아 둔 인증번호는 쓸 수 없게 한다 (새 번호를 발송하면 이전 인증번호 무효).
    await this.verifications.invalidateOthers(
      VerificationChannel.SMS,
      VerificationPurpose.TWO_FACTOR_SETUP,
      `${user.id}:`,
      target,
    );
    return {
      maskedPhoneNumber: maskPhoneNumber(phoneNumber),
      ...sent,
      remainingAttempts: this.remainingAttempts(user),
    };
  }

  /** 인증번호가 맞으면 휴대폰을 등록하고 2차 보안을 설정(또는 번호 변경)한다. */
  async confirmPhoneVerification(
    userId: number,
    phoneNumber: string,
    code: string,
    client: ClientInfo,
  ): Promise<GetTwoFactorResDto> {
    const user = await this.findUser(userId);
    if (
      user.twoFactorStatus === TwoFactorStatus.ENABLED &&
      user.twoFactorPhoneNumber === phoneNumber
    ) {
      throw new BusinessException(TwoFactorErrors.SAME_PHONE_NUMBER);
    }
    const target = verificationTarget(user.id, phoneNumber);
    await this.confirmSms(
      user,
      VerificationPurpose.TWO_FACTOR_SETUP,
      target,
      code,
    );

    const now = new Date();
    const action =
      user.twoFactorStatus === TwoFactorStatus.ENABLED
        ? TwoFactorHistoryAction.PHONE_CHANGED
        : TwoFactorHistoryAction.ENABLED;
    await this.prisma.$transaction(async (tx) => {
      await this.verifications.consumeVerified(
        tx,
        VerificationChannel.SMS,
        VerificationPurpose.TWO_FACTOR_SETUP,
        target,
      );
      await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorStatus: TwoFactorStatus.ENABLED,
          twoFactorPhoneNumber: phoneNumber,
          twoFactorEnabledDate: now,
          // 새 번호로 인증한 것도 최근 인증으로 본다.
          twoFactorVerifiedDate: now,
        },
      });
      await tx.twoFactorHistory.create({
        data: {
          userId: user.id,
          action,
          phoneNumber,
          ...truncateClient(client),
          createDate: now,
        },
      });
    });
    return this.getStatus(user.id);
  }

  /** 2차 보안을 해제한다. 해제 이력에 회원, 일시, 접속 정보를 남긴다. */
  async disable(
    userId: number,
    client: ClientInfo,
  ): Promise<GetTwoFactorResDto> {
    const user = await this.findUser(userId);
    if (user.twoFactorStatus !== TwoFactorStatus.ENABLED) {
      throw new BusinessException(TwoFactorErrors.NOT_ENABLED);
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorStatus: TwoFactorStatus.DISABLED,
          twoFactorPhoneNumber: null,
          twoFactorEnabledDate: null,
          twoFactorVerifiedDate: null,
        },
      }),
      this.prisma.twoFactorHistory.create({
        data: {
          userId: user.id,
          action: TwoFactorHistoryAction.DISABLED,
          ...truncateClient(client),
          createDate: now,
        },
      }),
    ]);
    return this.getStatus(user.id);
  }

  /** 중요 기능 실행 전 재인증용 인증번호를 등록 휴대폰으로 보낸다. */
  async sendVerification(
    userId: number,
  ): Promise<SendTwoFactorVerificationResDto> {
    const user = await this.findUser(userId);
    const phoneNumber = this.enabledPhoneNumber(user);
    this.assertNotLocked(user);

    const sent = await this.verifications.sendSmsCode(
      VerificationPurpose.TWO_FACTOR,
      phoneNumber,
      verificationTarget(user.id, phoneNumber),
    );
    return {
      maskedPhoneNumber: maskPhoneNumber(phoneNumber),
      ...sent,
      remainingAttempts: this.remainingAttempts(user),
    };
  }

  /** 인증번호가 맞으면 10분 동안 중요 기능을 다시 묻지 않는다. */
  async confirmVerification(
    userId: number,
    code: string,
  ): Promise<ConfirmTwoFactorVerificationResDto> {
    const user = await this.findUser(userId);
    const phoneNumber = this.enabledPhoneNumber(user);
    const target = verificationTarget(user.id, phoneNumber);
    await this.confirmSms(user, VerificationPurpose.TWO_FACTOR, target, code);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.verifications.consumeVerified(
        tx,
        VerificationChannel.SMS,
        VerificationPurpose.TWO_FACTOR,
        target,
      );
      await tx.user.update({
        where: { id: user.id },
        data: { twoFactorVerifiedDate: now },
      });
    });
    return {
      verifiedUntil: new Date(now.getTime() + TWO_FACTOR_VERIFIED_TTL_MS),
    };
  }

  /**
   * 중요 기능 실행 전에 호출한다. 2차 보안을 설정하지 않았으면 409 TWO_FACTOR_NOT_ENABLED,
   * 최근 10분 안에 재인증하지 않았으면 403 TWO_FACTOR_REQUIRED를 던진다. (상장 신청 최종 제출 등)
   */
  async requireVerification(
    userId: number,
    action: TwoFactorAction,
  ): Promise<void> {
    const user = await this.findUser(userId);
    if (user.twoFactorStatus !== TwoFactorStatus.ENABLED) {
      throw new BusinessException(TwoFactorErrors.NOT_ENABLED, undefined, {
        action,
      });
    }
    this.assertRecentlyVerified(user, action);
  }

  /**
   * 주문 기능 최초 활성화. 2차 보안을 설정한 계정만 첫 주문 전에 재인증을 요구한다.
   * 미설정 계정과 이미 주문한 적이 있는 계정은 그대로 통과한다.
   */
  async assertOrderAllowed(userId: number): Promise<void> {
    const user = await this.findUser(userId);
    if (
      user.orderActivatedDate ||
      user.twoFactorStatus !== TwoFactorStatus.ENABLED
    ) {
      return;
    }
    this.assertRecentlyVerified(user, TwoFactorAction.ORDER_ACTIVATION);
  }

  /** 첫 주문을 접수하면 주문 기능을 활성화한 것으로 기록한다. */
  async markOrderActivated(userId: number): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, orderActivatedDate: null },
      data: { orderActivatedDate: new Date() },
    });
  }

  // ─── 새 기기 확인 ─────────────────────────────────────

  /** 30일 안에 사용한 신뢰 기기면 마지막 사용 시각을 갱신하고 true를 돌려준다. */
  async useTrustedDevice(
    userId: number,
    deviceIdHash: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.trustedDevice.updateMany({
      where: {
        userId,
        deviceIdHash,
        lastUsedDate: { gt: new Date(Date.now() - TRUSTED_DEVICE_TTL_MS) },
      },
      data: { lastUsedDate: new Date() },
    });
    return count > 0;
  }

  async trustDevice(
    userId: number,
    deviceIdHash: string,
    userAgent?: string,
  ): Promise<void> {
    const now = new Date();
    const data = {
      lastUsedDate: now,
      userAgent: userAgent?.slice(0, 255) ?? null,
    };
    await this.prisma.trustedDevice.upsert({
      where: { userId_deviceIdHash: { userId, deviceIdHash } },
      create: { userId, deviceIdHash, createDate: now, ...data },
      update: data,
    });
  }

  /** 비밀번호 재설정 등으로 모든 기기를 다시 확인하게 할 때 쓴다. */
  async forgetDevices(userId: number): Promise<void> {
    await this.prisma.trustedDevice.deleteMany({ where: { userId } });
  }

  /** 2차 보안 설정 계정은 등록 휴대폰 SMS, 미설정 계정은 가입 이메일로 확인한다. */
  loginMethod(user: TwoFactorUser): {
    method: LoginVerificationMethod;
    maskedTarget: string;
  } {
    return user.twoFactorStatus === TwoFactorStatus.ENABLED &&
      user.twoFactorPhoneNumber
      ? {
          method: LoginVerificationMethod.SMS,
          maskedTarget: maskPhoneNumber(user.twoFactorPhoneNumber),
        }
      : {
          method: LoginVerificationMethod.EMAIL,
          maskedTarget: maskEmail(user.email),
        };
  }

  async sendLoginVerification(
    user: TwoFactorUser,
  ): Promise<SentLoginVerification> {
    const { method, maskedTarget } = this.loginMethod(user);
    if (method === LoginVerificationMethod.SMS) {
      this.assertNotLocked(user);
      const phoneNumber = user.twoFactorPhoneNumber!;
      const sent = await this.verifications.sendSmsCode(
        VerificationPurpose.NEW_DEVICE_LOGIN,
        phoneNumber,
        verificationTarget(user.id, phoneNumber),
      );
      return {
        method,
        maskedTarget,
        ...sent,
        remainingAttempts: this.remainingAttempts(user),
      };
    }

    const sent = await this.verifications.sendEmailCode(
      VerificationPurpose.NEW_DEVICE_LOGIN,
      user.email,
      verificationTarget(user.id, user.email),
    );
    return { method, maskedTarget, ...sent, remainingAttempts: null };
  }

  /** 새 기기 확인 인증번호를 검증하고 사용 처리한다. SMS로 확인했으면 최근 인증 시각도 갱신한다. */
  async confirmLoginVerification(
    user: TwoFactorUser,
    code: string,
  ): Promise<void> {
    const { method } = this.loginMethod(user);
    const isSms = method === LoginVerificationMethod.SMS;
    const target = verificationTarget(
      user.id,
      isSms ? user.twoFactorPhoneNumber! : user.email,
    );
    if (isSms) {
      await this.confirmSms(
        user,
        VerificationPurpose.NEW_DEVICE_LOGIN,
        target,
        code,
      );
    } else {
      await this.verifications.confirmEmailCode(
        VerificationPurpose.NEW_DEVICE_LOGIN,
        target,
        code,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.verifications.consumeVerified(
        tx,
        isSms ? VerificationChannel.SMS : VerificationChannel.EMAIL,
        VerificationPurpose.NEW_DEVICE_LOGIN,
        target,
      );
      if (isSms) {
        await tx.user.update({
          where: { id: user.id },
          data: { twoFactorVerifiedDate: new Date() },
        });
      }
    });
  }

  // ─── 내부 ─────────────────────────────────────────────

  /**
   * SMS 인증번호를 확인한다. 틀릴 때마다 회원의 연속 실패 횟수를 올리고,
   * 5회가 되면 30분 동안 SMS 인증을 제한하고 남은 인증번호를 무효로 한다.
   */
  private async confirmSms(
    user: TwoFactorUser,
    purpose: VerificationPurpose,
    target: string,
    code: string,
  ): Promise<void> {
    this.assertNotLocked(user);
    try {
      await this.verifications.confirmSmsCode(purpose, target, code);
    } catch (error) {
      if (
        error instanceof BusinessException &&
        (error.error === VerificationErrors.CODE_MISMATCH ||
          error.error === VerificationErrors.ATTEMPTS_EXCEEDED)
      ) {
        throw await this.recordFailure(user, purpose, target);
      }
      throw error;
    }

    if (user.twoFactorFailCount > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorFailCount: 0 },
      });
    }
  }

  private async recordFailure(
    user: TwoFactorUser,
    purpose: VerificationPurpose,
    target: string,
  ): Promise<BusinessException> {
    const { twoFactorFailCount } = await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorFailCount: { increment: 1 } },
      select: { twoFactorFailCount: true },
    });

    if (twoFactorFailCount >= MAX_TWO_FACTOR_FAIL_COUNT) {
      const lockedUntil = new Date(Date.now() + TWO_FACTOR_LOCK_MS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { twoFactorFailCount: 0, twoFactorLockedUntil: lockedUntil },
      });
      // 제한이 끝난 뒤에는 새 인증번호를 받아 처음부터 다시 시도한다.
      await this.verifications.invalidatePending(
        VerificationChannel.SMS,
        purpose,
        target,
      );
      return new BusinessException(TwoFactorErrors.LOCKED, undefined, {
        lockedUntil,
      });
    }

    const remaining = MAX_TWO_FACTOR_FAIL_COUNT - twoFactorFailCount;
    return new BusinessException(
      VerificationErrors.CODE_MISMATCH,
      `${VerificationErrors.CODE_MISMATCH.message} (남은 횟수 ${remaining}회)`,
      { remainingAttempts: remaining },
    );
  }

  private assertNotLocked(user: TwoFactorUser): void {
    if (
      user.twoFactorLockedUntil &&
      user.twoFactorLockedUntil.getTime() > Date.now()
    ) {
      throw new BusinessException(TwoFactorErrors.LOCKED, undefined, {
        lockedUntil: user.twoFactorLockedUntil,
      });
    }
  }

  private assertRecentlyVerified(
    user: TwoFactorUser,
    action: TwoFactorAction,
  ): void {
    const until = this.verifiedUntil(user);
    if (!until || until.getTime() <= Date.now()) {
      throw new BusinessException(TwoFactorErrors.REQUIRED, undefined, {
        action,
      });
    }
  }

  private verifiedUntil(user: TwoFactorUser): Date | null {
    return user.twoFactorVerifiedDate
      ? new Date(
          user.twoFactorVerifiedDate.getTime() + TWO_FACTOR_VERIFIED_TTL_MS,
        )
      : null;
  }

  private enabledPhoneNumber(user: TwoFactorUser): string {
    if (
      user.twoFactorStatus !== TwoFactorStatus.ENABLED ||
      !user.twoFactorPhoneNumber
    ) {
      throw new BusinessException(TwoFactorErrors.NOT_ENABLED);
    }
    return user.twoFactorPhoneNumber;
  }

  private remainingAttempts(user: TwoFactorUser): number {
    return MAX_TWO_FACTOR_FAIL_COUNT - user.twoFactorFailCount;
  }

  private async findUser(userId: number): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    return user;
  }
}

/** 기기 ID는 원문 대신 해시로 저장한다. */
export function hashDeviceId(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex');
}

/** 인증번호를 회원별로 구분한다. 같은 번호·이메일을 다른 회원이 요청해도 서로 영향을 주지 않는다. */
function verificationTarget(userId: number, address: string): string {
  return `${userId}:${address}`;
}

function truncateClient(client: ClientInfo): ClientInfo {
  return {
    ipAddress: client.ipAddress?.slice(0, 45),
    userAgent: client.userAgent?.slice(0, 255),
  };
}
