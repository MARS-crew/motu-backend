import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const getAllAndOverride = vi.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  const contextWith = (user?: Record<string, unknown>) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('@Roles()가 없으면 통과한다', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWith({ userId: 1, role: 'USER' }))).toBe(
      true,
    );
  });

  it('필요한 역할이면 통과한다', () => {
    getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(guard.canActivate(contextWith({ userId: 1, role: 'ADMIN' }))).toBe(
      true,
    );
  });

  it('역할이 다르면 AUTH_FORBIDDEN', () => {
    getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(() =>
      guard.canActivate(contextWith({ userId: 1, role: 'USER' })),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'AUTH_FORBIDDEN' }),
      }),
    );
  });
});
