import { lockListingIssuer } from './listing-issuer.js';
import type { Prisma } from '../../generated/prisma/client.js';

describe('상장 신청자 계좌 잠금과 탈퇴 판정', () => {
  it.each(['ACTIVE', 'LOCKED', 'BLOCKED', 'WITHDRAWN'])(
    '계좌 잠금 이후 별도 쿼리로 %s를 읽는다',
    async (status) => {
      const calls: string[] = [];
      const tx = {
        account: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) },
        $queryRaw: vi.fn(async (sql: TemplateStringsArray) => {
          const text = sql.join('');
          calls.push(text);
          return text.includes('FROM accounts')
            ? [{ account_id: 7 }]
            : [{ status }];
        }),
      };
      const result = await lockListingIssuer(
        tx as unknown as Prisma.TransactionClient,
        2,
      );
      expect(result).toEqual({ id: 7, withdrawn: status === 'WITHDRAWN' });
      expect(calls[0]).toContain('FOR UPDATE');
      expect(calls[1]).toContain('user_status::text');
    },
  );
  it('잠금 전에 계좌가 없어지면 승인·발행을 허용하지 않는다', async () => {
    const tx = {
      account: { findUnique: vi.fn().mockResolvedValue({ id: 7 }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    expect(
      await lockListingIssuer(tx as unknown as Prisma.TransactionClient, 2),
    ).toBeNull();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
