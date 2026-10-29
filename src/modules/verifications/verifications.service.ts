import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import { SmsSender } from '../../common/sms/sms-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EnvironmentVariables } from '../../config/env.validation.js';
import {
  Prisma,
  Verification,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { VerificationErrors } from './verifications.errors.js';

const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
/** 남은 유효시간이 이보다 짧으면 기존 인증번호를 다시 보내지 않고 새로 발급한다. */
const REUSE_MIN_REMAINING_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
/** 인증 완료 후 회원가입 등 다음 단계를 마쳐야 하는 시간 */
const VERIFIED_TTL_MS = 30 * 60 * 1000;

/** 메일 제목·SMS 문구에 넣을 인증 목적 */
const PURPOSE_LABELS: Record<VerificationPurpose, string> = {
  [VerificationPurpose.SIGNUP]: '회원가입 이메일',
  [VerificationPurpose.FIND_LOGIN_ID]: '아이디 찾기',
  [VerificationPurpose.NEW_DEVICE_LOGIN]: '새 기기 로그인',
  [VerificationPurpose.TWO_FACTOR_SETUP]: '2차 보안 휴대폰 등록',
  [VerificationPurpose.TWO_FACTOR]: '2차 보안',
};

export interface SentVerification {
  expiresAt: Date;
  resendAvailableAt: Date;
}

/**
 * 이메일·SMS 인증번호 발급과 검증. 인증번호 원문은 저장하거나 로그에 남기지 않는다.
 * 재발송 시 같은 번호를 보내기 위해 암호화한 값만 함께 저장한다.
 */
@Injectable()
export class VerificationsService {
  private readonly cipherKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailSender: MailSender,
    private readonly smsSender: SmsSender,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.cipherKey = Buffer.from(
      hkdfSync(
        'sha256',
        config.get('JWT_ACCESS_SECRET', { infer: true }),
        '',
        'verification-code',
        32,
      ),
    );
  }

  /**
   * 유효한 인증번호가 남아 있으면 같은 번호를 다시 보내고, 없으면 새로 발급한다.
   * 발송에 실패해도 인증번호는 유효하며, 재발송 제한은 발송에 성공했을 때만 걸린다.
   */
  /**
   * `target`은 인증번호를 구분하는 값으로, 기본은 받는 주소다.
   * 회원별로 따로 관리해야 하면(2차 보안 등) `회원ID:주소`처럼 넘긴다.
   */
  sendEmailCode(
    purpose: VerificationPurpose,
    email: string,
    target: string = email,
  ): Promise<SentVerification> {
    return this.sendCode(VerificationChannel.EMAIL, purpose, target, email);
  }

  /** 휴대폰 번호(숫자만)로 SMS 인증번호를 보낸다. 규칙은 이메일과 같다. */
  sendSmsCode(
    purpose: VerificationPurpose,
    phoneNumber: string,
    target: string = phoneNumber,
  ): Promise<SentVerification> {
    return this.sendCode(VerificationChannel.SMS, purpose, target, phoneNumber);
  }

  /** `target`은 발송할 때 넘긴 값과 같아야 한다. */
  confirmEmailCode(
    purpose: VerificationPurpose,
    target: string,
    code: string,
  ): Promise<void> {
    return this.confirmCode(VerificationChannel.EMAIL, purpose, target, code);
  }

  confirmSmsCode(
    purpose: VerificationPurpose,
    target: string,
    code: string,
  ): Promise<void> {
    return this.confirmCode(VerificationChannel.SMS, purpose, target, code);
  }

  /** 아직 사용하지 않은 인증번호를 모두 쓸 수 없게 한다. 새 인증번호를 받아야 다시 인증할 수 있다. */
  async invalidatePending(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    target: string,
  ): Promise<void> {
    await this.prisma.verification.updateMany({
      where: { channel, purpose, target, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  private async sendCode(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    target: string,
    recipient: string,
  ): Promise<SentVerification> {
    const now = new Date();
    const latest = await this.findLatestPending(channel, purpose, target);

    if (
      latest?.sentAt &&
      now.getTime() - latest.sentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new BusinessException(VerificationErrors.RESEND_TOO_SOON);
    }

    const { id, code, expiresAt } =
      latest && this.isReusable(latest, now)
        ? {
            id: latest.id,
            code: this.decryptCode(latest.codeCipher!),
            expiresAt: latest.expiresAt,
          }
        : await this.issueCode(channel, purpose, target, now);

    const remainingMinutes = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / 60_000,
    );
    if (channel === VerificationChannel.SMS) {
      await this.smsSender.send({
        to: recipient,
        text: `[MOTU] ${PURPOSE_LABELS[purpose]} 인증번호 [${code}] ${remainingMinutes}분 안에 입력해 주세요.`,
      });
    } else {
      await this.mailSender.send({
        to: recipient,
        subject: `[MOTU] ${PURPOSE_LABELS[purpose]} 인증번호`,
        text: `인증번호는 [${code}]입니다. ${remainingMinutes}분 안에 입력해 주세요.`,
      });
    }

    const sentAt = new Date();
    await this.prisma.verification.update({
      where: { id },
      data: { sentAt },
    });

    return {
      expiresAt,
      resendAvailableAt: new Date(sentAt.getTime() + RESEND_COOLDOWN_MS),
    };
  }

  private async confirmCode(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    target: string,
    code: string,
  ): Promise<void> {
    const verification = await this.findLatestPending(channel, purpose, target);

    if (!verification) {
      throw new BusinessException(VerificationErrors.NOT_FOUND);
    }
    if (verification.verifiedAt) {
      return;
    }
    if (verification.expiresAt.getTime() <= Date.now()) {
      throw new BusinessException(VerificationErrors.EXPIRED);
    }
    if (verification.attemptCount >= MAX_ATTEMPTS) {
      throw this.attemptsExceeded();
    }

    if (!this.matches(verification.codeHash, this.hashCode(target, code))) {
      // 동시에 여러 번 요청해도 최대 횟수를 넘지 않도록 조건부로 증가시킨다.
      const { count } = await this.prisma.verification.updateMany({
        where: { id: verification.id, attemptCount: { lt: MAX_ATTEMPTS } },
        data: { attemptCount: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - verification.attemptCount - 1;
      if (count === 0 || remaining <= 0) {
        throw this.attemptsExceeded();
      }
      throw new BusinessException(
        VerificationErrors.CODE_MISMATCH,
        `${VerificationErrors.CODE_MISMATCH.message} (남은 횟수 ${remaining}회)`,
        { remainingAttempts: remaining },
      );
    }

    await this.prisma.verification.update({
      where: { id: verification.id },
      data: { verifiedAt: new Date() },
    });
  }

  /**
   * 인증 완료된 결과를 사용 처리한다. 회원가입처럼 인증이 필요한 작업과 같은 트랜잭션에서 호출한다.
   */
  async consumeVerified(
    tx: Prisma.TransactionClient,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    target: string,
  ): Promise<void> {
    const { count } = await tx.verification.updateMany({
      where: {
        channel,
        purpose,
        target,
        verifiedAt: { gt: new Date(Date.now() - VERIFIED_TTL_MS) },
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    if (count === 0) {
      throw new BusinessException(VerificationErrors.REQUIRED);
    }
  }

  /** 새 인증번호를 발급한다. 이전 인증번호와 인증 결과는 사용할 수 없게 된다. */
  private async issueCode(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    target: string,
    now: Date,
  ): Promise<{ id: number; code: string; expiresAt: Date }> {
    const code = this.generateCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

    const [, created] = await this.prisma.$transaction([
      this.prisma.verification.updateMany({
        where: { channel, purpose, target, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.verification.create({
        data: {
          channel,
          purpose,
          target,
          codeHash: this.hashCode(target, code),
          codeCipher: this.encryptCode(code),
          expiresAt,
          createDate: now,
        },
      }),
    ]);

    return { id: created.id, code, expiresAt };
  }

  /** 인증 전이고, 시도 횟수와 유효시간이 남아 있으면 같은 번호를 다시 보낸다. */
  private isReusable(verification: Verification, now: Date): boolean {
    return (
      verification.codeCipher !== null &&
      verification.verifiedAt === null &&
      verification.attemptCount < MAX_ATTEMPTS &&
      verification.expiresAt.getTime() - now.getTime() >= REUSE_MIN_REMAINING_MS
    );
  }

  private findLatestPending(
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    target: string,
  ) {
    return this.prisma.verification.findFirst({
      where: { channel, purpose, target, consumedAt: null },
      orderBy: { createDate: 'desc' },
    });
  }

  private generateCode(): string {
    return randomInt(0, 10 ** CODE_LENGTH)
      .toString()
      .padStart(CODE_LENGTH, '0');
  }

  private hashCode(target: string, code: string): string {
    return createHash('sha256').update(`${target}:${code}`).digest('hex');
  }

  /** `iv.authTag.암호문`을 base64url로 이어 붙인다. */
  private encryptCode(code: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cipherKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(code, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private decryptCode(codeCipher: string): string {
    const [iv, authTag, encrypted] = codeCipher
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.cipherKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  private matches(expectedHash: string, actualHash: string): boolean {
    return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
  }

  private attemptsExceeded(): BusinessException {
    return new BusinessException(VerificationErrors.ATTEMPTS_EXCEEDED);
  }
}
