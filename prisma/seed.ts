import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import {
  CashLedgerType,
  PrismaClient,
  Role,
} from '../src/generated/prisma/client.js';
import { INITIAL_CASH } from '../src/modules/accounts/accounts.constants.js';

/**
 * 테스트용 관리자·일반 사용자 계정을 만든다. 이미 있는 계정은 건드리지 않는다.
 *
 * 로컬에서는 아래 기본 비밀번호를 쓴다. 저장소에 공개된 값이라
 * production에서는 SEED_ADMIN_PASSWORD, SEED_USER_PASSWORD를 반드시 지정해야 한다.
 */
const isProduction = process.env.NODE_ENV === 'production';

function password(envName: string, localDefault: string): string {
  const value = process.env[envName];
  if (value) {
    return value;
  }
  if (isProduction) {
    throw new Error(`production에서는 ${envName} 환경 변수가 필요합니다.`);
  }
  return localDefault;
}

const seedUsers = [
  {
    loginId: 'motuadmin',
    password: password('SEED_ADMIN_PASSWORD', 'motuadmin1!'),
    nickname: '모투관리자',
    email: 'admin@motu.test',
    role: Role.ADMIN,
  },
  {
    loginId: 'motuuser',
    password: password('SEED_USER_PASSWORD', 'motuuser1!'),
    nickname: '모투테스터',
    email: 'user@motu.test',
    role: Role.USER,
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  for (const seed of seedUsers) {
    const existing = await prisma.user.findUnique({
      where: { loginId: seed.loginId },
    });
    if (existing) {
      console.log(`이미 있음: ${seed.loginId} (${seed.role})`);
      continue;
    }

    await prisma.user.create({
      data: {
        loginId: seed.loginId,
        password: await hash(seed.password),
        nickname: seed.nickname,
        email: seed.email,
        role: seed.role,
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        account: {
          create: {
            cash: INITIAL_CASH,
            ledgers: {
              create: {
                type: CashLedgerType.DEPOSIT,
                amount: INITIAL_CASH,
                balanceAfter: INITIAL_CASH,
              },
            },
          },
        },
      },
    });
    console.log(`생성: ${seed.loginId} (${seed.role})`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
