import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EnvironmentVariables } from '../../config/env.validation.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { InquiryErrors } from './inquiries.errors.js';

/** DB의 원자적 upsert로 여러 서버 인스턴스에서도 같은 제한을 적용한다. */
@Injectable()
export class InquirySubmissionLimiter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async cleanupExpired() {
    // 요청당 최대 100행만 청소한다. 원문 IP·이메일과 만료 이력을 보존하지 않는다.
    // 다른 이메일의 카운터 잠금과 교차하지 않도록 접수 트랜잭션 밖에서 청소한다.
    await this.prisma.$executeRaw`
      DELETE FROM inquiry_submission_limits WHERE expires_at <= clock_timestamp() AND key IN (
        SELECT key FROM inquiry_submission_limits WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
      )
    `;
  }

  consumeEmail(tx: Prisma.TransactionClient, email: string) {
    return this.consume(tx, 'email', email.toLowerCase(), 10, 3600);
  }

  private async consume(
    tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
    scope: string,
    identity: string,
    limit: number,
    seconds: number,
  ) {
    const key = createHmac(
      'sha256',
      this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    )
      .update(`motu:public-inquiry:${scope}:v1:${identity}`)
      .digest('hex');
    const [result] = await tx.$queryRaw<
      { count: number; retryAfterSeconds: number }[]
    >`
      INSERT INTO inquiry_submission_limits (key, count, expires_at)
      VALUES (${key}, 1, clock_timestamp() + ${seconds} * INTERVAL '1 second')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN inquiry_submission_limits.expires_at <= clock_timestamp()
          THEN 1 ELSE LEAST(inquiry_submission_limits.count + 1, ${limit + 1}) END,
        expires_at = CASE WHEN inquiry_submission_limits.expires_at <= clock_timestamp()
          THEN clock_timestamp() + ${seconds} * INTERVAL '1 second'
          ELSE inquiry_submission_limits.expires_at END
      RETURNING count,
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))::int AS "retryAfterSeconds"
    `;
    if (!result || result.count > limit)
      throw new BusinessException(
        InquiryErrors.SUBMISSION_RATE_LIMITED,
        undefined,
        {
          retryAfterSeconds: result?.retryAfterSeconds ?? seconds,
          limit,
          windowSeconds: seconds,
        },
      );
  }
}
