import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { InquiryErrors } from './inquiries.errors.js';

/** 단일 프로세스의 계정별 고정 윈도 제한. 계정 잠금/해제나 일반 로그인 횟수는 변경하지 않는다. */
@Injectable()
export class InquirySessionRateLimitGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const loginId: unknown = request.body?.loginId;
    const key = createHash('sha256')
      .update(typeof loginId === 'string' ? loginId.trim().toLowerCase() : '')
      .digest('hex');
    const now = Date.now();
    for (const [savedKey, value] of this.windows) {
      if (value.until <= now) this.windows.delete(savedKey);
    }
    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= 10000)
        throw new BusinessException(InquiryErrors.TOO_MANY_ATTEMPTS);
      window = { count: 0, until: now + 60000 };
      this.windows.set(key, window);
    }
    if (++window.count > 10)
      throw new BusinessException(InquiryErrors.TOO_MANY_ATTEMPTS);
    return true;
  }
}
