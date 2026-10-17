import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Prisma,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { VerificationErrors } from './verifications.errors.js';

const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
/** 인증 완료 후 회원가입 등 다음 단계를 마쳐야 하는 시간 */
const VERIFIED_TTL_MS = 30 * 60 * 1000;

const MAIL_SUBJECTS: Record<VerificationPurpose, string> = {
  [VerificationPurpose.SIGNUP]: '[MOTU] 회원가입 이메일 인증번호',
};

export interface SentVerification {
  expiresAt: Date;
  resendAvailableAt: Date;
}

/**
 * 이메일·SMS 인증번호 발급과 검증. 인증번호 원문은 저장하거나 로그에 남기지 않는다.
 */
@Injectable()
export class VerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailSender: MailSender,
  ) {}

  async sendEmailCode(
    purpose: VerificationPurpose,
    email: string,
  ): Promise<SentVerification> {
    const now = new Date();
    const latest = await this.findLatestPending(
      VerificationChannel.EMAIL,
      purpose,
      email,
    );

    if (
      latest &&
      now.getTime() - latest.createDate.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new BusinessException(VerificationErrors.RESEND_TOO_SOON);
    }

    const code = this.generateCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

    await this.prisma.$transaction([
      // 새 인증번호를 발급하면 이전 인증번호와 인증 결과는 사용할 수 없다.
      this.prisma.verification.updateMany({
        where: {
          channel: VerificationChannel.EMAIL,
          purpose,
          target: email,
          consumedAt: null,
        },
        data: { consumedAt: now },
      }),
      this.prisma.verification.create({
        data: {
          channel: VerificationChannel.EMAIL,
          purpose,
          target: email,
          codeHash: this.hashCode(email, code),
          expiresAt,
          createDate: now,
        },
      }),
    ]);

    await this.mailSender.send({
      to: email,
      subject: MAIL_SUBJECTS[purpose],
      text: `인증번호는 [${code}]입니다. 5분 안에 입력해 주세요.`,
    });

    return {
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
    };
  }

  async confirmEmailCode(
    purpose: VerificationPurpose,
    email: string,
    code: string,
  ): Promise<void> {
    const verification = await this.findLatestPending(
      VerificationChannel.EMAIL,
      purpose,
      email,
    );

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

    if (!this.matches(verification.codeHash, this.hashCode(email, code))) {
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

  private matches(expectedHash: string, actualHash: string): boolean {
    return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
  }

  private attemptsExceeded(): BusinessException {
    return new BusinessException(VerificationErrors.ATTEMPTS_EXCEEDED);
  }
}
