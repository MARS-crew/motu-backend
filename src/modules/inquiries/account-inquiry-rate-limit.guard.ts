import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { InquirySubmissionLimiter } from './inquiry-submission-limiter.service.js';

@Injectable()
export class AccountInquiryRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: InquirySubmissionLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // 임의 X-Forwarded-For를 신뢰하지 않는다. Express의 현재 proxy 신뢰 설정을 따른다.
    await this.limiter.consumeIp(
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
    return true;
  }
}
