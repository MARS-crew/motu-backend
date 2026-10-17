import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../../common/auth/auth-user.type.js';
import { ROLES_KEY } from '../../../common/auth/roles.decorator.js';
import { BusinessException } from '../../../common/exceptions/business.exception.js';
import { Role } from '../../../generated/prisma/client.js';
import { AuthErrors } from '../auth.errors.js';

/**
 * 전역 Guard. `@Roles()`가 붙은 API는 해당 역할의 사용자만 통과한다. JwtAuthGuard 다음에 실행된다.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new BusinessException(AuthErrors.FORBIDDEN);
    }
    return true;
  }
}
