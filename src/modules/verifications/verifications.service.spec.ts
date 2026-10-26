import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { MailSender } from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { VerificationsService } from './verifications.service.js';

const EMAIL = 'name@example.com';
const hash = (code: string) =>
  createHash('sha256').update(`${EMAIL}:${code}`).digest('hex');

describe('VerificationsService', () => {
  const verification = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const prisma = {
    verification,
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const sendMail = vi.fn();
  const mailSender = { send: sendMail } as unknown as MailSender;
  const config = {
    get: () => 'test-jwt-access-secret-at-least-32-chars',
  } as unknown as ConfigService<never, true>;
  const service = new VerificationsService(prisma, mailSender, config);
  const sentCode = (call = 0) => {
    const { text } = sendMail.mock.calls[call][0] as { text: string };
    return /\[(\d{6})\]/.exec(text)?.[1];
  };

  const pending = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    codeHash: hash('123456'),
    attemptCount: 0,
    expiresAt: new Date(Date.now() + 60_000),
    verifiedAt: null,
    createDate: new Date(Date.now() - 60_000),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    verification.updateMany.mockResolvedValue({ count: 1 });
    verification.create.mockImplementation(({ data }) => ({ id: 2, ...data }));
  });

  describe('sendEmailCode', () => {
    it('6자리 인증번호를 메일로 보내고 해시와 암호문만 저장한다', async () => {
      verification.findFirst.mockResolvedValue(null);

      await service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL);

      const code = sentCode();
      expect(code).toBeDefined();
      const { data } = verification.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({
        channel: VerificationChannel.EMAIL,
        target: EMAIL,
        codeHash: hash(code!),
      });
      expect(data.codeCipher).toEqual(expect.any(String));
      expect(data.codeCipher).not.toContain(code!);
      expect(verification.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { sentAt: expect.any(Date) },
      });
    });

    it('유효한 인증번호가 남아 있으면 같은 번호를 다시 보낸다', async () => {
      verification.findFirst.mockResolvedValue(null);
      await service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL);
      const { data } = verification.create.mock.calls[0][0] as {
        data: { codeCipher: string };
      };

      verification.findFirst.mockResolvedValue(
        pending({
          id: 2,
          codeCipher: data.codeCipher,
          attemptCount: 2,
          // 재사용 기준인 1분 경계와 실행 지연을 분리해 간헐적인 새 번호 발급을 피한다.
          expiresAt: new Date(Date.now() + 120_000),
          sentAt: new Date(Date.now() - 31_000),
        }),
      );
      verification.create.mockClear();
      await service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL);

      expect(sentCode(1)).toBe(sentCode(0));
      expect(verification.create).not.toHaveBeenCalled();
      // 같은 번호를 다시 보낼 때는 시도 횟수를 초기화하지 않는다.
      expect(verification.update).toHaveBeenLastCalledWith({
        where: { id: 2 },
        data: { sentAt: expect.any(Date) },
      });
    });

    it('남은 유효시간이 1분보다 짧으면 새 번호를 발급한다', async () => {
      verification.findFirst.mockResolvedValue(
        pending({
          codeCipher: 'unused',
          expiresAt: new Date(Date.now() + 30_000),
          sentAt: new Date(Date.now() - 31_000),
        }),
      );

      await service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL);

      expect(verification.create).toHaveBeenCalledOnce();
    });

    it('시도 횟수를 초과한 인증번호는 다시 보내지 않고 새로 발급한다', async () => {
      verification.findFirst.mockResolvedValue(
        pending({
          codeCipher: 'unused',
          attemptCount: 5,
          sentAt: new Date(Date.now() - 31_000),
        }),
      );

      await service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL);

      expect(verification.create).toHaveBeenCalledOnce();
    });

    it('발송에 성공하고 30초 안에 다시 요청하면 거부한다', async () => {
      verification.findFirst.mockResolvedValue(
        pending({ sentAt: new Date(Date.now() - 10_000) }),
      );

      await expect(
        service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL),
      ).rejects.toMatchObject({
        response: { code: 'VERIFICATION_RESEND_TOO_SOON' },
      });
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('발송에 실패하면 발송 시각을 남기지 않아 바로 다시 요청할 수 있다', async () => {
      verification.findFirst.mockResolvedValue(null);
      sendMail.mockRejectedValueOnce(new Error('Brevo 메일 발송 실패: 500'));

      await expect(
        service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL),
      ).rejects.toThrow('Brevo 메일 발송 실패');
      expect(verification.update).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmailCode', () => {
    it('인증번호가 맞으면 인증 완료 처리한다', async () => {
      verification.findFirst.mockResolvedValue(pending());

      await service.confirmEmailCode(
        VerificationPurpose.SIGNUP,
        EMAIL,
        '123456',
      );

      expect(verification.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { verifiedAt: expect.any(Date) },
      });
    });

    it('인증번호가 틀리면 시도 횟수를 늘리고 남은 횟수를 알려준다', async () => {
      verification.findFirst.mockResolvedValue(pending({ attemptCount: 1 }));

      await expect(
        service.confirmEmailCode(VerificationPurpose.SIGNUP, EMAIL, '000000'),
      ).rejects.toMatchObject({
        response: {
          code: 'VERIFICATION_CODE_MISMATCH',
          message: expect.stringContaining('남은 횟수 3회'),
          details: { remainingAttempts: 3 },
        },
      });
      expect(verification.updateMany).toHaveBeenCalledWith({
        where: { id: 1, attemptCount: { lt: 5 } },
        data: { attemptCount: { increment: 1 } },
      });
    });

    it('5번째 실패하면 횟수 초과로 처리한다', async () => {
      verification.findFirst.mockResolvedValue(pending({ attemptCount: 4 }));

      await expect(
        service.confirmEmailCode(VerificationPurpose.SIGNUP, EMAIL, '000000'),
      ).rejects.toMatchObject({
        response: { code: 'VERIFICATION_ATTEMPTS_EXCEEDED' },
      });
    });

    it('횟수를 이미 초과했으면 맞는 인증번호도 거부한다', async () => {
      verification.findFirst.mockResolvedValue(pending({ attemptCount: 5 }));

      await expect(
        service.confirmEmailCode(VerificationPurpose.SIGNUP, EMAIL, '123456'),
      ).rejects.toMatchObject({
        response: { code: 'VERIFICATION_ATTEMPTS_EXCEEDED' },
      });
    });

    it('만료된 인증번호는 거부한다', async () => {
      verification.findFirst.mockResolvedValue(
        pending({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(
        service.confirmEmailCode(VerificationPurpose.SIGNUP, EMAIL, '123456'),
      ).rejects.toMatchObject({ response: { code: 'VERIFICATION_EXPIRED' } });
    });

    it('요청한 인증번호가 없으면 거부한다', async () => {
      verification.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmEmailCode(VerificationPurpose.SIGNUP, EMAIL, '123456'),
      ).rejects.toMatchObject({ response: { code: 'VERIFICATION_NOT_FOUND' } });
    });
  });

  describe('consumeVerified', () => {
    it('인증 완료된 결과가 없으면 거부한다', async () => {
      const tx = {
        verification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      };

      await expect(
        service.consumeVerified(
          tx as never,
          VerificationChannel.EMAIL,
          VerificationPurpose.SIGNUP,
          EMAIL,
        ),
      ).rejects.toMatchObject({ response: { code: 'VERIFICATION_REQUIRED' } });
    });
  });
});
