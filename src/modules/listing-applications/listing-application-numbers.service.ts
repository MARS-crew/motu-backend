import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ListingSubmissionErrors } from './listing-submission.errors.js';

export function listingNumberDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('');
}

@Injectable()
export class ListingApplicationNumbersService {
  /** 같은 접수 트랜잭션에서 호출한다. 기존 정식 번호(삭제 포함)를 보존하며 일별로 직렬화한다. */
  async next(
    tx: Prisma.TransactionClient,
    submittedAt?: Date,
  ): Promise<string> {
    for (;;) {
      const day = listingNumberDate(submittedAt ?? new Date());
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`motu:listing-application-number:${day}`}))`;
      // 잠금을 기다리다 KST 날짜가 바뀌면 새 날짜의 잠금을 얻는다.
      if (!submittedAt && listingNumberDate(new Date()) !== day) {
        continue;
      }
      const pattern = `^LST-${day}-[0-9]{3}$`;
      const [row] = await tx.$queryRaw<{ next: number }[]>`
        SELECT COALESCE(MAX(SUBSTRING(application_number FROM 12)::int), 0) + 1 AS next
        FROM listing_applications WHERE application_number ~ ${pattern}
      `;
      if (!row || row.next < 1 || row.next > 999) {
        throw new BusinessException(ListingSubmissionErrors.NUMBER_LIMIT);
      }
      return `LST-${day}-${String(row.next).padStart(3, '0')}`;
    }
  }
}
