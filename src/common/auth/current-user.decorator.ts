import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser, AuthenticatedRequest } from './auth-user.type.js';

/**
 * 로그인한 사용자 정보를 주입한다. 예) me(@CurrentUser() user: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
