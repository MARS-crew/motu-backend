import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../common/auth/auth-user.type.js';
import { ROLES_KEY } from '../../common/auth/roles.decorator.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Role } from '../../generated/prisma/client.js';
import { AdminAccountErrors } from './admin-accounts.errors.js';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from './allow-password-change-required.decorator.js';

/**
 * 전역 Guard. 임시 비밀번호 상태의 관리자는 `@Roles(Role.ADMIN)` API를 쓸 수 없다. 비밀번호 변경만 허용한다.
 * AuthModule에서 JwtAuthGuard·RolesGuard 다음에 등록해 request.user가 채워진 뒤 실행된다.
 */
@Injectable()
export class AdminPasswordChangeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (
      !roles?.includes(Role.ADMIN) ||
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
        targets,
      )
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user?.role !== Role.ADMIN) {
      return true;
    }
    const profile = await this.prisma.adminProfile.findUnique({
      where: { userId: user.userId },
      select: { passwordChangeRequired: true },
    });
    if (profile?.passwordChangeRequired) {
      throw new BusinessException(AdminAccountErrors.PASSWORD_CHANGE_REQUIRED);
    }
    return true;
  }
}
