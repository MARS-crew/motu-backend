import type { Prisma } from '../../generated/prisma/client.js';

/** #88 탈퇴가 사용하는 accounts 행 잠금과 공유한다. 잠금을 얻은 다음 별도 SQL로 상태를 재조회한다. */
export async function lockListingIssuer(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  const account = await tx.account.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!account) return null;
  const locked = await tx.$queryRaw<{ account_id: number }[]>`
    SELECT account_id FROM accounts WHERE account_id=${account.id} FOR UPDATE
  `;
  if (!locked.length) return null;
  // #88의 WITHDRAWN enum 마이그레이션 전후 모두 읽을 수 있도록 텍스트로 조회한다.
  const [user] = await tx.$queryRaw<{ status: string }[]>`
    SELECT user_status::text AS status FROM users WHERE user_id=${userId}
  `;
  if (!user) return null;
  return { id: account.id, withdrawn: user.status === 'WITHDRAWN' };
}
