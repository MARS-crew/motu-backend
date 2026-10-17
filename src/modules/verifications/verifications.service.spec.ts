import { createHash } from 'node:crypto';
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
  const service = new VerificationsService(prisma, mailSender);

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
  });

  describe('sendEmailCode', () => {
    it('6자리 인증번호를 메일로 보내고 해시만 저장한다', async () => {
      verification.findFirst.mockResolvedValue(null);

      await service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL);

      const { text } = sendMail.mock.calls[0][0] as { text: string };
      const code = /\[(\d{6})\]/.exec(text)?.[1];
      expect(code).toBeDefined();
      expect(verification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: VerificationChannel.EMAIL,
          target: EMAIL,
          codeHash: hash(code!),
        }),
      });
    });

    it('30초 안에 다시 요청하면 거부한다', async () => {
      verification.findFirst.mockResolvedValue(
        pending({ createDate: new Date(Date.now() - 10_000) }),
      );

      await expect(
        service.sendEmailCode(VerificationPurpose.SIGNUP, EMAIL),
      ).rejects.toMatchObject({
        response: { code: 'VERIFICATION_RESEND_TOO_SOON' },
      });
      expect(sendMail).not.toHaveBeenCalled();
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
