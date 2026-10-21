import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import { MailErrors } from '../../common/mail/mail.errors.js';
import { UsersService } from '../users/users.service.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { AuthService, maskLoginId } from './auth.service.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  const refreshToken = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  const passwordResetToken = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  const prisma = {
    refreshToken,
    passwordResetToken,
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const signAsync = vi.fn().mockResolvedValue('access-token');
  const jwtService = { signAsync } as unknown as JwtService;
  const config = {
    get: (key: string) =>
      ({
        JWT_ACCESS_EXPIRES_IN: 900,
        JWT_REFRESH_EXPIRES_IN_DAYS: 14,
        PASSWORD_RESET_URL: 'http://localhost:5173/password-reset',
      })[key],
  } as unknown as ConfigService<never, true>;
  const findByLoginId = vi.fn();
  const findById = vi.fn();
  const recordLoginFailure = vi.fn();
  const recordLoginSuccess = vi.fn();
  const findByEmail = vi.fn();
  const changePassword = vi.fn();
  const usersService = {
    findByLoginId,
    findById,
    findByEmail,
    recordLoginFailure,
    recordLoginSuccess,
    changePassword,
  } as unknown as UsersService;
  const confirmEmailCode = vi.fn();
  const consumeVerified = vi.fn();
  const sendEmailCode = vi.fn();
  const verificationsService = {
    confirmEmailCode,
    consumeVerified,
    sendEmailCode,
  } as unknown as VerificationsService;
  const sendMail = vi.fn();
  const mailSender = { send: sendMail } as unknown as MailSender;
  const service = new AuthService(
    prisma,
    jwtService,
    config,
    usersService,
    verificationsService,
    mailSender,
  );

  let user: Record<string, unknown>;

  beforeAll(async () => {
    user = {
      id: 1,
      loginId: 'motuuser',
      email: 'user@motu.test',
      nickname: '모투테스터',
      role: 'USER',
      userStatus: 'ACTIVE',
      password: await hash('motuuser1!'),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findByLoginId.mockResolvedValue(user);
    findById.mockResolvedValue(user);
    findByEmail.mockResolvedValue(user);
    refreshToken.updateMany.mockResolvedValue({ count: 1 });
    passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    passwordResetToken.findFirst.mockResolvedValue(null);
  });

  describe('login', () => {
    it('비밀번호가 맞으면 토큰을 발급하고 실패 횟수를 초기화한다', async () => {
      const result = await service.login({
        loginId: 'motuuser',
        password: 'motuuser1!',
      });

      expect(recordLoginSuccess).toHaveBeenCalledWith(1);
      expect(signAsync).toHaveBeenCalledWith({ sub: 1, role: 'USER' });
      expect(result).toMatchObject({
        accessToken: 'access-token',
        accessTokenExpiresIn: 900,
        user: { userId: 1, loginId: 'motuuser', role: 'USER' },
      });
      // Refresh 토큰은 원문이 아닌 해시로 저장한다.
      expect(refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          tokenHash: sha256(result.refreshToken),
        }),
      });
    });

    it('비밀번호가 틀리면 실패 횟수를 details로 알려준다', async () => {
      recordLoginFailure.mockResolvedValue({ failCount: 2, locked: false });

      await expect(
        service.login({ loginId: 'motuuser', password: 'wrong' }),
      ).rejects.toMatchObject({
        status: 401,
        response: {
          code: 'AUTH_INVALID_CREDENTIALS',
          details: { failCount: 2, maxFailCount: 5 },
        },
      });
      expect(recordLoginSuccess).not.toHaveBeenCalled();
    });

    it('5회째 실패하면 계정 잠금으로 응답한다', async () => {
      recordLoginFailure.mockResolvedValue({ failCount: 5, locked: true });

      await expect(
        service.login({ loginId: 'motuuser', password: 'wrong' }),
      ).rejects.toMatchObject({ response: { code: 'AUTH_ACCOUNT_LOCKED' } });
    });

    it('잠긴 계정은 비밀번호가 맞아도 로그인할 수 없다', async () => {
      findByLoginId.mockResolvedValue({ ...user, userStatus: 'LOCKED' });

      await expect(
        service.login({ loginId: 'motuuser', password: 'motuuser1!' }),
      ).rejects.toMatchObject({ response: { code: 'AUTH_ACCOUNT_LOCKED' } });
      expect(recordLoginFailure).not.toHaveBeenCalled();
    });

    it('없는 아이디는 비밀번호 오류와 같은 에러로 응답한다', async () => {
      findByLoginId.mockResolvedValue(null);

      await expect(
        service.login({ loginId: 'nobody', password: 'x' }),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_CREDENTIALS' },
      });
    });
  });

  describe('refresh', () => {
    const saved = (overrides: Record<string, unknown> = {}) => ({
      id: 10,
      userId: 1,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      ...overrides,
    });

    it('사용한 Refresh 토큰을 폐기하고 새 토큰을 발급한다', async () => {
      refreshToken.findUnique.mockResolvedValue(saved());

      const result = await service.refresh('old-token');

      expect(refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('old-token') },
      });
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 10, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.refreshToken).not.toBe('old-token');
    });

    it('이미 폐기된 토큰을 다시 쓰면 그 사용자의 세션을 모두 끊는다', async () => {
      refreshToken.findUnique.mockResolvedValue(
        saved({ revokedAt: new Date() }),
      );

      await expect(service.refresh('reused')).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_REFRESH_TOKEN' },
      });
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('만료된 토큰은 거부한다', async () => {
      refreshToken.findUnique.mockResolvedValue(
        saved({ expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(service.refresh('expired')).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_REFRESH_TOKEN' },
      });
    });

    it('동시에 같은 토큰으로 재발급하면 한 요청만 성공한다', async () => {
      refreshToken.findUnique.mockResolvedValue(saved());
      refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('raced')).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_REFRESH_TOKEN' },
      });
      expect(refreshToken.create).not.toHaveBeenCalled();
    });

    it('잠긴 계정은 재발급할 수 없다', async () => {
      refreshToken.findUnique.mockResolvedValue(saved());
      findById.mockResolvedValue({ ...user, userStatus: 'LOCKED' });

      await expect(service.refresh('token')).rejects.toMatchObject({
        response: { code: 'AUTH_ACCOUNT_LOCKED' },
      });
    });
  });

  describe('assertUserActive', () => {
    it('정상 회원이면 통과한다', async () => {
      await expect(service.assertUserActive(1)).resolves.toBeUndefined();
      expect(findById).toHaveBeenCalledWith(1);
    });

    it.each([
      ['잠긴 회원', 'LOCKED', 'AUTH_ACCOUNT_LOCKED'],
      ['정지된 회원', 'BLOCKED', 'AUTH_ACCOUNT_BLOCKED'],
    ])('%s이면 막는다', async (_name, userStatus, code) => {
      findById.mockResolvedValue({ ...user, userStatus });

      await expect(service.assertUserActive(1)).rejects.toMatchObject({
        response: { code },
      });
    });

    it('회원이 없으면 로그인이 필요하다고 막는다', async () => {
      findById.mockResolvedValue(null);

      await expect(service.assertUserActive(1)).rejects.toMatchObject({
        response: { code: 'AUTH_UNAUTHORIZED' },
      });
    });
  });

  describe('findLoginId', () => {
    it('인증번호를 확인하고 결과를 사용 처리한 뒤 가린 아이디를 내려준다', async () => {
      const result = await service.findLoginId('user@motu.test', '123456');

      expect(confirmEmailCode).toHaveBeenCalledWith(
        'FIND_LOGIN_ID',
        'user@motu.test',
        '123456',
      );
      expect(consumeVerified).toHaveBeenCalledWith(
        prisma,
        'EMAIL',
        'FIND_LOGIN_ID',
        'user@motu.test',
      );
      expect(result).toEqual({ maskedLoginId: 'mot***er' });
    });

    it('가입되지 않은 이메일로는 인증번호를 보내지 않는다', async () => {
      findByEmail.mockResolvedValue(null);

      await expect(
        service.sendFindLoginIdCode('none@motu.test'),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_EMAIL_NOT_REGISTERED' },
      });
      expect(sendEmailCode).not.toHaveBeenCalled();
    });
  });

  describe('maskLoginId', () => {
    it.each([
      ['minhyuk01', 'min***01'],
      ['motuuser', 'mot***er'],
      ['motu01', 'mo***'],
      ['abcde', 'ab***'],
    ])('%s → %s', (loginId, masked) => {
      expect(maskLoginId(loginId)).toBe(masked);
    });
  });

  describe('requestPasswordReset', () => {
    it('정보가 맞으면 이전 링크를 무효화하고 새 링크를 메일로 보낸다', async () => {
      await service.requestPasswordReset('motuuser', 'user@motu.test');

      expect(passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      const { text } = sendMail.mock.calls[0][0] as { text: string };
      const token = /token=([\w-]+)/.exec(text)?.[1];
      expect(token).toBeDefined();
      expect(passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 1, tokenHash: sha256(token!) }),
      });
    });

    it.each([
      ['이메일이 다르면', { email: 'other@motu.test' }],
      ['잠긴 계정이면', { userStatus: 'LOCKED' }],
    ])('%s 에러 없이 메일을 보내지 않는다', async (_case, overrides) => {
      findByLoginId.mockResolvedValue({ ...user, ...overrides });

      await expect(
        service.requestPasswordReset('motuuser', 'user@motu.test'),
      ).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('메일 발송에 실패해도 가입 여부가 드러나지 않도록 같은 응답을 준다', async () => {
      sendMail.mockRejectedValueOnce(
        new BusinessException(MailErrors.SEND_FAILED),
      );

      await expect(
        service.requestPasswordReset('motuuser', 'user@motu.test'),
      ).resolves.toBeUndefined();
    });

    it('1분 안에 다시 요청하면 메일을 보내지 않는다', async () => {
      passwordResetToken.findFirst.mockResolvedValue({
        createDate: new Date(Date.now() - 10_000),
      });

      await service.requestPasswordReset('motuuser', 'user@motu.test');

      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const savedToken = (overrides: Record<string, unknown> = {}) => ({
      id: 20,
      userId: 1,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      ...overrides,
    });

    it('비밀번호를 바꾸고 모든 세션을 끊는다', async () => {
      passwordResetToken.findUnique.mockResolvedValue(savedToken());

      await service.resetPassword('reset-token', 'motunew1!');

      expect(passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('reset-token') },
      });
      expect(changePassword).toHaveBeenCalledWith(1, 'motunew1!');
      expect(refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it.each([
      ['사용한 링크', { usedAt: new Date() }],
      ['만료된 링크', { expiresAt: new Date(Date.now() - 1) }],
    ])('%s는 거부한다', async (_case, overrides) => {
      passwordResetToken.findUnique.mockResolvedValue(savedToken(overrides));

      await expect(
        service.resetPassword('reset-token', 'motunew1!'),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_PASSWORD_RESET_TOKEN' },
      });
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('현재 비밀번호와 같으면 거부하고 링크는 다시 쓸 수 있게 둔다', async () => {
      passwordResetToken.findUnique.mockResolvedValue(savedToken());

      await expect(
        service.resetPassword('reset-token', 'motuuser1!'),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_SAME_AS_CURRENT_PASSWORD' },
      });
      expect(passwordResetToken.updateMany).not.toHaveBeenCalled();
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('같은 링크로 동시에 요청하면 한 번만 처리한다', async () => {
      passwordResetToken.findUnique.mockResolvedValue(savedToken());
      passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resetPassword('reset-token', 'motunew1!'),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_PASSWORD_RESET_TOKEN' },
      });
      expect(changePassword).not.toHaveBeenCalled();
    });
  });
});
