import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { IS_OPTIONAL_AUTH_KEY } from '../../../common/auth/optional-auth.decorator.js';
import { BusinessException } from '../../../common/exceptions/business.exception.js';
import { AuthErrors } from '../auth.errors.js';
import { AuthService } from '../auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const getAllAndOverride = vi.fn();
  const verifyAsync = vi.fn();
  const assertUserActive = vi.fn();
  const guard = new JwtAuthGuard(
    { getAllAndOverride } as unknown as Reflector,
    { verifyAsync } as unknown as JwtService,
    { assertUserActive } as unknown as AuthService,
  );

  const contextWith = (request: Record<string, unknown>) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    getAllAndOverride.mockReturnValue(false);
  });

  it('@Public() API는 토큰 없이 통과한다', async () => {
    getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(contextWith({ headers: {} }))).resolves.toBe(
      true,
    );
  });

  describe('@OptionalAuth() API', () => {
    beforeEach(() => {
      getAllAndOverride.mockImplementation(
        (key: string) => key === IS_OPTIONAL_AUTH_KEY,
      );
    });

    it('토큰이 없으면 비회원으로 통과한다', async () => {
      const request = { headers: {} };

      await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
      expect(request).not.toHaveProperty('user');
    });

    it('토큰이 있으면 회원으로 처리한다', async () => {
      verifyAsync.mockResolvedValue({ sub: 1, role: 'USER' });
      const request = { headers: { authorization: 'Bearer valid' } };

      await guard.canActivate(contextWith(request));

      expect(assertUserActive).toHaveBeenCalledWith(1);
      expect(request).toMatchObject({ user: { userId: 1, role: 'USER' } });
    });

    it('토큰이 만료되었으면 비회원으로 처리하지 않고 AUTH_TOKEN_EXPIRED', async () => {
      verifyAsync.mockRejectedValue(
        new TokenExpiredError('jwt expired', new Date()),
      );

      await expect(
        guard.canActivate(
          contextWith({ headers: { authorization: 'Bearer expired' } }),
        ),
      ).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_EXPIRED' } });
    });
  });

  it('토큰이 없으면 AUTH_UNAUTHORIZED', async () => {
    await expect(
      guard.canActivate(contextWith({ headers: {} })),
    ).rejects.toMatchObject({ response: { code: 'AUTH_UNAUTHORIZED' } });
  });

  it('유효한 토큰이면 request.user에 사용자 정보를 넣는다', async () => {
    verifyAsync.mockResolvedValue({ sub: 1, role: 'ADMIN' });
    const request = { headers: { authorization: 'Bearer valid' } };

    await guard.canActivate(contextWith(request));

    expect(verifyAsync).toHaveBeenCalledWith('valid');
    expect(assertUserActive).toHaveBeenCalledWith(1);
    expect(request).toMatchObject({ user: { userId: 1, role: 'ADMIN' } });
  });

  it('토큰이 유효해도 잠긴 회원이면 막는다', async () => {
    verifyAsync.mockResolvedValue({ sub: 1, role: 'USER' });
    assertUserActive.mockRejectedValue(
      new BusinessException(AuthErrors.ACCOUNT_LOCKED),
    );
    const request = { headers: { authorization: 'Bearer valid' } };

    await expect(guard.canActivate(contextWith(request))).rejects.toMatchObject(
      { response: { code: 'AUTH_ACCOUNT_LOCKED' } },
    );
    expect(request).not.toHaveProperty('user');
  });

  it('만료된 토큰이면 AUTH_TOKEN_EXPIRED', async () => {
    verifyAsync.mockRejectedValue(
      new TokenExpiredError('jwt expired', new Date()),
    );

    await expect(
      guard.canActivate(
        contextWith({ headers: { authorization: 'Bearer expired' } }),
      ),
    ).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_EXPIRED' } });
    expect(assertUserActive).not.toHaveBeenCalled();
  });
});
