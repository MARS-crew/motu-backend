import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import {
  CashLedgerType,
  PrismaClient,
  Role,
  TradeStatus,
} from '../src/generated/prisma/client.js';
import { INITIAL_CASH } from '../src/modules/accounts/accounts.constants.js';

/**
 * 테스트용 관리자·일반 사용자 계정, 상품 카테고리, 테스트 상품을 만든다. 이미 있는 데이터는 건드리지 않는다.
 * 테스트 상품은 production에서는 만들지 않는다.
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

/** 상장 신청에서 고르는 카테고리. 코드 순서가 마켓의 카테고리 버튼 순서다. */
const seedSectors = [
  'SaaS / 소프트웨어',
  'AI / 데이터',
  '핀테크',
  '커머스 / 유통',
  '콘텐츠 / 미디어',
  '헬스케어',
  '교육',
  '모빌리티',
  '기타',
].map((name, index) => ({ code: index + 1, name }));

const DAY = 24 * 60 * 60 * 1000;

/** 신규 상장(7일) 표시와 정렬을 확인할 수 있게 상장일을 오늘 기준으로 나눠 둔다. */
const seedStocks = [
  {
    name: 'CloudWorks',
    sectorCode: 1,
    basePrice: 4_350,
    daysAgo: 30,
    summary: '팀 협업을 위한 클라우드 문서 도구',
    operatorName: '클라우드웍스',
  },
  {
    name: 'DataLens',
    sectorCode: 2,
    basePrice: 8_200,
    daysAgo: 20,
    summary: '데이터를 한눈에 보여주는 AI 분석 대시보드',
    operatorName: '데이터렌즈',
  },
  {
    name: 'PayNow',
    sectorCode: 3,
    basePrice: 6_700,
    daysAgo: 12,
    summary: '간편하게 송금하고 정산하는 결제 서비스',
    operatorName: '페이나우',
  },
  {
    name: 'ShopMate',
    sectorCode: 4,
    basePrice: 3_100,
    daysAgo: 9,
    summary: '소상공인을 위한 온라인 상점 관리 도구',
    operatorName: '샵메이트',
  },
  {
    name: 'PLI',
    sectorCode: 5,
    basePrice: 1_200,
    daysAgo: 6,
    summary: '취향에 맞는 음악 플레이리스트 추천 앱',
    operatorName: '플리',
  },
  {
    name: 'FitLife',
    sectorCode: 6,
    basePrice: 12_000,
    daysAgo: 4,
    summary: '운동과 식단을 함께 관리하는 헬스케어 앱',
    operatorName: '핏라이프',
  },
  {
    name: 'StudyOn',
    sectorCode: 7,
    basePrice: 5_500,
    daysAgo: 2,
    summary: '스터디 그룹을 만들고 학습을 기록하는 서비스',
    operatorName: '스터디온',
  },
  {
    name: 'RideGo',
    sectorCode: 8,
    basePrice: 9_800,
    daysAgo: 1,
    summary: '가까운 공유 킥보드를 바로 찾는 모빌리티 앱',
    operatorName: '라이드고',
    tradeStatus: TradeStatus.PENDING,
  },
  {
    name: 'Moodo',
    sectorCode: 9,
    basePrice: 2_400,
    daysAgo: 45,
    summary: '하루 기분을 기록하는 감정 일기 서비스',
    operatorName: '무도',
    tradeStatus: TradeStatus.PAUSED,
  },
  {
    name: 'CloudNote',
    sectorCode: 1,
    basePrice: 3_900,
    daysAgo: 60,
    summary: '어디서나 쓰는 클라우드 메모장',
    operatorName: '클라우드노트',
    tradeStatus: TradeStatus.CLOSED,
  },
];

async function main(): Promise<void> {
  await createUsers();
  await createSectors();
  if (!isProduction) {
    await createStocks();
  }
}

async function createSectors(): Promise<void> {
  for (const sector of seedSectors) {
    await prisma.sector.upsert({
      where: { code: sector.code },
      create: sector,
      update: {},
    });
  }
  console.log(`카테고리: ${seedSectors.length}개`);
}

/**
 * 앞쪽 6개 상품에만 주요 서비스 지표를 넣는다. 나머지는 "정보없음" 표시를 확인하는 용도다.
 */
function metricsOf(index: number) {
  if (index >= 6) {
    return {};
  }
  const scale = BigInt(index + 1);
  return {
    mau: 50_000n * scale,
    dau: 10_000n * scale,
    revenue: 300_000_000n * scale,
    transactionVolume: index % 2 === 0 ? 1_000_000_000n * scale : null,
    metricsStartDate: new Date('2025-10-01'),
    metricsEndDate: new Date('2026-09-30'),
  };
}

async function createStocks(): Promise<void> {
  const now = Date.now();
  for (const [index, seed] of seedStocks.entries()) {
    const stockCode = `MOTU${String(index + 1).padStart(4, '0')}`;
    const existing = await prisma.stock.findUnique({ where: { stockCode } });
    if (existing) {
      // 지표 컬럼이 나중에 추가되어, 이미 만든 테스트 상품에는 지표만 채운다.
      if (existing.mau === null) {
        await prisma.stock.update({
          where: { stockCode },
          data: metricsOf(index),
        });
      }
      console.log(`이미 있음: ${stockCode} ${seed.name}`);
      continue;
    }

    await prisma.stock.create({
      data: {
        stockCode,
        sectorCode: seed.sectorCode,
        name: seed.name,
        summary: seed.summary,
        description: `${seed.name}의 상세 설명입니다.`,
        mainImageUrl: `https://placehold.co/600x400?text=${seed.name}`,
        officialUrl: `https://${seed.name.toLowerCase()}.example.com`,
        operatorName: seed.operatorName,
        listedShares: 1_000_000n,
        basePrice: BigInt(seed.basePrice),
        listingDate: new Date(now - seed.daysAgo * DAY),
        tradeStatus: seed.tradeStatus ?? TradeStatus.ACTIVE,
        ...metricsOf(index),
      },
    });
    console.log(`생성: ${stockCode} ${seed.name}`);
  }
}

async function createUsers(): Promise<void> {
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
