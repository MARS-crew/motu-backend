import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '../../common/auth/roles.decorator.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Role } from '../../generated/prisma/client.js';
import { AdminAccountErrors } from './admin-accounts.errors.js';
import { AdminPasswordChangeGuard } from './admin-password-change.guard.js';
import { AllowPasswordChangeRequired } from './allow-password-change-required.decorator.js';

@Roles(Role.ADMIN)
class AdminController {
  handle() {}
  @AllowPasswordChangeRequired()
  changePassword() {}
}

class PublicController {
  handle() {}
}

describe('AdminPasswordChangeGuard', () => {
  const adminProfile = { findUnique: vi.fn() };
  const prisma = { adminProfile } as unknown as PrismaService;
  const guard = new AdminPasswordChangeGuard(new Reflector(), prisma);

  const contextOf = (
    controller: new () => object,
    handler: string,
    user?: { userId: number; role: Role },
  ) =>
    ({
      getClass: () => controller,
      getHandler: () =>
        (controller.prototype as Record<string, () => void>)[handler],
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  const admin = { userId: 4, role: Role.ADMIN };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('임시 비밀번호 상태의 관리자는 관리자 API를 쓸 수 없다', async () => {
    adminProfile.findUnique.mockResolvedValue({ passwordChangeRequired: true });

    await expect(
      guard.canActivate(contextOf(AdminController, 'handle', admin)),
    ).rejects.toEqual(
      new BusinessException(AdminAccountErrors.PASSWORD_CHANGE_REQUIRED),
    );
    expect(adminProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 4 },
      select: { passwordChangeRequired: true },
    });
  });

  it('비밀번호 변경은 임시 비밀번호 상태에서도 쓸 수 있다', async () => {
    await expect(
      guard.canActivate(contextOf(AdminController, 'changePassword', admin)),
    ).resolves.toBe(true);
    expect(adminProfile.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['비밀번호를 바꾼 관리자', { passwordChangeRequired: false }],
    ['관리자 정보가 없는 기존 관리자', null],
  ])('%s는 통과한다', async (_, profile) => {
    adminProfile.findUnique.mockResolvedValue(profile);

    await expect(
      guard.canActivate(contextOf(AdminController, 'handle', admin)),
    ).resolves.toBe(true);
  });

  it('관리자 API가 아니면 확인하지 않는다', async () => {
    await expect(
      guard.canActivate(contextOf(PublicController, 'handle', admin)),
    ).resolves.toBe(true);
    expect(adminProfile.findUnique).not.toHaveBeenCalled();
  });

  it('관리자가 아닌 사용자는 RolesGuard가 막으므로 확인하지 않는다', async () => {
    await expect(
      guard.canActivate(
        contextOf(AdminController, 'handle', { userId: 2, role: Role.USER }),
      ),
    ).resolves.toBe(true);
    expect(adminProfile.findUnique).not.toHaveBeenCalled();
  });
});
