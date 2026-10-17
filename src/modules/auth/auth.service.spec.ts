import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('AuthService', () => {
  const refreshToken = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  const prisma = { refreshToken } as unknown as PrismaService;
  const signAsync = vi.fn().mockResolvedValue('access-token');
  const jwtService = { signAsync } as unknown as JwtService;
  const config = {
    get: (key: string) =>
      ({ JWT_ACCESS_EXPIRES_IN: 900, JWT_REFRESH_EXPIRES_IN_DAYS: 14 })[key],
  } as unknown as ConfigService<never, true>;
  const findByLoginId = vi.fn();
  const findById = vi.fn();
  const recordLoginFailure = vi.fn();
  const recordLoginSuccess = vi.fn();
  const usersService = {
    findByLoginId,
    findById,
    recordLoginFailure,
    recordLoginSuccess,
  } as unknown as UsersService;
  const service = new AuthService(prisma, jwtService, config, usersService);

  let user: Record<string, unknown>;

  beforeAll(async () => {
    user = {
      id: 1,
      loginId: 'motuuser',
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
    refreshToken.updateMany.mockResolvedValue({ count: 1 });
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
});
