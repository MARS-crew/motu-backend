import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.type.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { UsersService } from '../users/users.service.js';
import { InquiryErrors as Errors } from './inquiries.errors.js';
import {
  INQUIRY_TOKEN_AUDIENCE,
  INQUIRY_TOKEN_ISSUER,
  inquiryTokenSecret,
} from './inquiries.constants.js';
import { isRestricted } from './inquiries.service.js';

@Injectable()
export class InquiryAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer \S+$/.test(authorization))
      throw new BusinessException(Errors.UNAUTHORIZED);
    const token = authorization.slice(7);
    let payload: { sub?: unknown; purpose?: unknown };
    let limited = true;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: inquiryTokenSecret(
          this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        ),
        issuer: INQUIRY_TOKEN_ISSUER,
        audience: INQUIRY_TOKEN_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (payload.purpose !== 'INQUIRY')
        throw new BusinessException(Errors.UNAUTHORIZED);
    } catch (error) {
      if (error instanceof TokenExpiredError)
        throw new BusinessException(Errors.TOKEN_EXPIRED);
      // 계정 제한이 해제된 뒤에는 일반 로그인 토큰으로 기존 문의를 조회할 수 있다.
      limited = false;
      try {
        payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
      } catch (normalError) {
        throw new BusinessException(
          normalError instanceof TokenExpiredError
            ? Errors.TOKEN_EXPIRED
            : Errors.UNAUTHORIZED,
        );
      }
      if (payload.purpose !== undefined)
        throw new BusinessException(Errors.UNAUTHORIZED);
    }
    if (
      typeof payload.sub !== 'number' ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub < 1 ||
      payload.sub > 2147483647
    )
      throw new BusinessException(Errors.UNAUTHORIZED);
    const user = await this.users.findById(payload.sub);
    if (!user || (!limited && isRestricted(user.userStatus)))
      throw new BusinessException(Errors.UNAUTHORIZED);
    request.user = { userId: user.id, role: user.role };
    return true;
  }
}
