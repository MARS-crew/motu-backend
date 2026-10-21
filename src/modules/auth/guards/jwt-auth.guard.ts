import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { AuthenticatedRequest } from '../../../common/auth/auth-user.type.js';
import { IS_PUBLIC_KEY } from '../../../common/auth/public.decorator.js';
import { BusinessException } from '../../../common/exceptions/business.exception.js';
import { Role } from '../../../generated/prisma/client.js';
import { AuthErrors } from '../auth.errors.js';
import { AuthService } from '../auth.service.js';

interface AccessTokenPayload {
  sub: number;
  role: Role;
}

/**
 * 전역 Guard. `@Public()`이 없는 API는 `Authorization: Bearer <accessToken>`이 있어야 통과한다.
 * 토큰이 유효해도 잠김·정지 회원이면 막는다.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new BusinessException(AuthErrors.UNAUTHORIZED);
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch (error) {
      throw new BusinessException(
        error instanceof TokenExpiredError
          ? AuthErrors.TOKEN_EXPIRED
          : AuthErrors.UNAUTHORIZED,
      );
    }

    await this.authService.assertUserActive(payload.sub);
    request.user = { userId: payload.sub, role: payload.role };
    return true;
  }
}
