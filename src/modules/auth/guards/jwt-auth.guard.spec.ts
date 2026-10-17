import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const getAllAndOverride = vi.fn();
  const verifyAsync = vi.fn();
  const guard = new JwtAuthGuard(
    { getAllAndOverride } as unknown as Reflector,
    { verifyAsync } as unknown as JwtService,
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
    expect(request).toMatchObject({ user: { userId: 1, role: 'ADMIN' } });
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
  });
});
