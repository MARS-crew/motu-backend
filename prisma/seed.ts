import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import {
  CashLedgerType,
  FaqCategory,
  ListingApplicationStatus,
  NoticeType,
  Prisma,
  PrismaClient,
  Role,
  TradeStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { INITIAL_CASH } from '../src/modules/accounts/accounts.constants.js';
import { LISTING_DRAFT_LIFETIME_MS } from '../src/modules/listing-applications/listing-applications.constants.js';
import { normalizeListingUrl } from '../src/modules/listing-applications/listing-applications.validation.js';
import { marketSeedSql } from './seed-market.js';

/**
 * 테스트용 관리자·일반 사용자 계정, 상품 카테고리, 테스트 상품·공지·FAQ를 만든다. 이미 있는 데이터는 건드리지 않는다.
 * 테스트 상품·공지·FAQ, 화면 상태별 테스트 계정, motuuser의 이용 기록, 테스트 거래는 production에서는 만들지 않는다.
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
    await createNotices();
    await createFaqs();
    await createTestUsers();
    await createUserActivity();
    await createMarketActivity();
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

/**
 * 상품마다 호가 단위가 다른 경우를 확인할 수 있게 기준가에 따라 나눠 둔다.
 */
function orderRulesOf(basePrice: number) {
  const tickSize = basePrice < 5_000 ? 10n : 100n;
  return {
    priceTickSize: tickSize,
    minOrderPrice: tickSize,
    minOrderQty: 1n,
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
      // 주문 규칙 컬럼이 나중에 추가되어 1로 채워졌으면 실제 규칙으로 바꾼다.
      if (existing.priceTickSize === 1n) {
        await prisma.stock.update({
          where: { stockCode },
          data: orderRulesOf(seed.basePrice),
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
        ...orderRulesOf(seed.basePrice),
        listingDate: new Date(now - seed.daysAgo * DAY),
        tradeStatus: seed.tradeStatus ?? TradeStatus.ACTIVE,
        ...metricsOf(index),
      },
    });
    console.log(`생성: ${stockCode} ${seed.name}`);
  }
}

/**
 * 중요 공지 상단 고정과 게시 기간을 확인할 수 있게 게시일을 오늘 기준으로 나눠 둔다.
 * 게시가 끝난 공지와 아직 게시 전인 공지는 목록에 나오지 않아야 한다.
 */
const seedNotices = [
  {
    type: NoticeType.ALL,
    title: '모투 서비스 오픈 안내',
    isImportant: true,
    daysAgo: 30,
    content:
      '안녕하세요. 모투(MOTU)입니다.\n\n모의투자 서비스 모투가 문을 열었습니다. 가입하면 3,000,000P를 지급해 드리며, 포인트는 서비스 안에서만 쓰는 가상 자산입니다.',
  },
  {
    type: NoticeType.ALL,
    title: '서비스 이용약관 개정 안내',
    isImportant: true,
    daysAgo: 2,
    content:
      '안녕하세요. 모투(MOTU)입니다.\n\n보다 안정적인 서비스 제공을 위해 서비스 이용약관이 개정되어 안내드립니다. 개정 약관은 게시일로부터 7일 뒤 적용됩니다.',
  },
  {
    type: NoticeType.STOCK,
    title: 'PLI 거래 일시 정지 안내',
    daysAgo: 1,
    content:
      '운영사 요청으로 PLI의 거래가 일시 정지되었습니다. 거래 재개 일정은 다시 안내드리겠습니다.',
  },
  {
    type: NoticeType.STOCK,
    title: 'CloudNote 거래 종료 안내',
    daysAgo: 5,
    content:
      'CloudNote의 거래가 종료되었습니다. 보유 수량은 그대로 유지됩니다.',
  },
  {
    type: NoticeType.ALL,
    title: '서버 점검 안내',
    daysAgo: 7,
    content:
      '서버 점검으로 02:00 ~ 04:00 동안 서비스 이용이 제한됩니다. 이용에 불편을 드려 죄송합니다.',
  },
  {
    type: NoticeType.ALL,
    title: '포인트 리셋 기능 안내',
    daysAgo: 10,
    content:
      '보유 포인트가 300,000P 미만이고 미체결 주문이 없으면 자산관리에서 포인트를 3,000,000P로 리셋할 수 있습니다. 리셋은 7일에 한 번 가능합니다.',
  },
  {
    type: NoticeType.ALL,
    title: '추가 포인트 지급 안내',
    daysAgo: 12,
    content: '자산관리에서 24시간마다 100,000P를 추가로 받을 수 있습니다.',
  },
  {
    type: NoticeType.ALL,
    title: '[게시 종료] 추석 연휴 고객센터 운영 안내',
    daysAgo: 20,
    postDays: 3,
    content: '게시 기간이 끝나 목록에 나오지 않아야 하는 공지입니다.',
  },
  {
    type: NoticeType.ALL,
    title: '[게시 예정] 신규 기능 업데이트 안내',
    daysAgo: -3,
    content: '아직 게시 전이라 목록에 나오지 않아야 하는 공지입니다.',
  },
];

/** FAQ 필터(거래/주문, 포인트/자산, 계정/보안, 상장, 기타)를 모두 확인할 수 있게 카테고리마다 넣는다. */
const seedFaqs = [
  {
    category: FaqCategory.TRADE,
    question: '주문은 언제 체결되나요?',
    answer:
      '지정가 주문은 같은 가격의 반대 주문이 있을 때 체결돼요.\n체결되지 않은 수량은 거래내역의 미체결 주문에서 취소할 수 있어요.',
  },
  {
    category: FaqCategory.TRADE,
    question: '거래가 정지된 상품도 주문할 수 있나요?',
    answer: '거래 대기·중지·종료 상태인 상품은 주문할 수 없어요.',
  },
  {
    category: FaqCategory.POINT,
    question: '포인트는 실제 돈인가요?',
    answer:
      '아니요. 포인트는 서비스 안에서만 쓰는 가상 자산이며 현금으로 바꿀 수 없어요.',
  },
  {
    category: FaqCategory.POINT,
    question: '포인트를 추가로 받을 수 있나요?',
    answer: '자산관리에서 24시간마다 100,000P를 추가로 받을 수 있어요.',
  },
  {
    category: FaqCategory.POINT,
    question: '포인트 리셋은 어떻게 하나요?',
    answer:
      '보유 종목과 미체결 주문이 없고 보유 포인트가 300,000P 미만이면 자산관리에서 3,000,000P로 리셋할 수 있어요.\n리셋은 7일에 한 번 가능해요.',
  },
  {
    category: FaqCategory.ACCOUNT,
    question: '2차 보안은 무엇인가요?',
    answer:
      '2차 보안은 새로운 기기 로그인, 연락처 변경, 주문 기능 최초 활성화, 상장 신청 최종 제출 등 추가 인증이 필요한 기능을 한 번의 인증으로 모두 처리할 수 있어요.\n마이페이지에서 설정/해제가 가능해요.',
  },
  {
    category: FaqCategory.ACCOUNT,
    question: '로그인을 여러 번 실패하면 어떻게 되나요?',
    answer:
      '비밀번호를 5번 틀리면 계정이 잠겨요. 비밀번호 재설정 후 다시 로그인해 주세요.',
  },
  {
    category: FaqCategory.LISTING,
    question: '상장 신청은 누구나 할 수 있나요?',
    answer:
      '회원이라면 상장 신청 기준을 확인한 뒤 신청할 수 있어요. 관리자 검토 후 승인되면 마켓에 상장돼요.',
  },
  {
    category: FaqCategory.ETC,
    question: '모의투자 결과로 실제 수익을 얻을 수 있나요?',
    answer: '모의투자 결과는 실제 투자 수익을 보장하지 않아요.',
  },
];

/** 이미 공지가 있으면 만들지 않는다. */
async function createNotices(): Promise<void> {
  if ((await prisma.notice.count()) > 0) {
    console.log('공지: 이미 있음');
    return;
  }
  const now = Date.now();
  await prisma.notice.createMany({
    data: seedNotices.map(({ daysAgo, postDays, ...notice }) => {
      const postStartDate = new Date(now - daysAgo * DAY);
      return {
        ...notice,
        postStartDate,
        postEndDate: postDays
          ? new Date(postStartDate.getTime() + postDays * DAY)
          : null,
      };
    }),
  });
  console.log(`공지: ${seedNotices.length}개`);
}

/** 이미 FAQ가 있으면 만들지 않는다. */
async function createFaqs(): Promise<void> {
  if ((await prisma.faq.count()) > 0) {
    console.log('FAQ: 이미 있음');
    return;
  }
  await prisma.faq.createMany({
    data: seedFaqs.map((faq, index) => ({ ...faq, sortOrder: index + 1 })),
  });
  console.log(`FAQ: ${seedFaqs.length}개`);
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

const HOUR = 60 * 60 * 1000;

interface TestUserSeed {
  loginId: string;
  nickname: string;
  email: string;
  userStatus?: UserStatus;
  loginFailCount?: number;
  /** 초기 지급 뒤의 포인트 변경. 계좌 잔액은 마지막 이력의 잔액이 된다. */
  ledgers?: { type: CashLedgerType; amount: bigint; hoursAgo: number }[];
  /** 만들 임시저장 신청서 수 */
  draftCount?: number;
}

/**
 * 화면 상태별 테스트 계정. 비밀번호는 motuuser와 같다.
 */
const testUsers: TestUserSeed[] = [
  {
    // 보유 포인트 300,000P 미만이라 바로 리셋할 수 있다.
    loginId: 'motureset',
    nickname: '리셋테스터',
    email: 'reset@motu.test',
    ledgers: [
      { type: CashLedgerType.ADJUST, amount: -2_750_000n, hoursAgo: 24 },
    ],
  },
  {
    // 2시간 전에 추가 포인트를 받아 22시간을 기다려야 한다.
    loginId: 'motugrant',
    nickname: '지급테스터',
    email: 'grant@motu.test',
    ledgers: [{ type: CashLedgerType.GRANT, amount: 100_000n, hoursAgo: 2 }],
  },
  {
    loginId: 'motulocked',
    nickname: '잠금테스터',
    email: 'locked@motu.test',
    userStatus: UserStatus.LOCKED,
    loginFailCount: 5,
  },
  {
    loginId: 'motublocked',
    nickname: '정지테스터',
    email: 'blocked@motu.test',
    userStatus: UserStatus.BLOCKED,
  },
  {
    // 임시저장 5건이 차 있어 새 신청서를 만들 수 없다.
    loginId: 'motudraft',
    nickname: '신청테스터',
    email: 'draft@motu.test',
    draftCount: 5,
  },
];

async function createTestUsers(): Promise<void> {
  const now = Date.now();
  for (const seed of testUsers) {
    const existing = await prisma.user.findUnique({
      where: { loginId: seed.loginId },
    });
    if (existing) {
      console.log(`이미 있음: ${seed.loginId}`);
      continue;
    }

    let balance = INITIAL_CASH;
    const ledgers: Prisma.CashLedgerCreateWithoutAccountInput[] = [
      {
        type: CashLedgerType.DEPOSIT,
        amount: INITIAL_CASH,
        balanceAfter: INITIAL_CASH,
        createDate: new Date(now - 7 * DAY),
      },
    ];
    for (const ledger of seed.ledgers ?? []) {
      balance += ledger.amount;
      ledgers.push({
        type: ledger.type,
        amount: ledger.amount,
        balanceAfter: balance,
        createDate: new Date(now - ledger.hoursAgo * HOUR),
      });
    }
    const lastGrant = seed.ledgers?.findLast(
      ({ type }) => type === CashLedgerType.GRANT,
    );

    const user = await prisma.user.create({
      data: {
        loginId: seed.loginId,
        password: await hash(seedUsers[1].password),
        nickname: seed.nickname,
        email: seed.email,
        role: Role.USER,
        userStatus: seed.userStatus,
        loginFailCount: seed.loginFailCount,
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        account: {
          create: {
            cash: balance,
            lastPointGrantAt: lastGrant
              ? new Date(now - lastGrant.hoursAgo * HOUR)
              : null,
            ledgers: { create: ledgers },
          },
        },
      },
    });
    for (let index = 0; index < (seed.draftCount ?? 0); index += 1) {
      await prisma.listingApplication.create({
        data: listingApplicationOf(user.id, {
          name: `${seed.loginId}${index + 1}`,
          status: ListingApplicationStatus.DRAFT,
          currentStep: (index % 4) + 1,
          daysAgo: index,
        }),
      });
    }
    console.log(`생성: ${seed.loginId}`);
  }
}

/**
 * motuuser에 포인트 이력, 관심상품, 최근 본 종목, 최근 검색어, 상장 신청서를 넣는다.
 * 항목마다 이미 기록이 있으면 건드리지 않는다. (화면에서 직접 쌓은 기록을 덮어쓰지 않도록)
 */
async function createUserActivity(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { loginId: seedUsers[1].loginId },
    include: {
      account: { include: { _count: { select: { ledgers: true } } } },
    },
  });
  if (!user?.account) {
    return;
  }
  const now = Date.now();
  const stocks = await prisma.stock.findMany({
    where: { isDeleted: false, tradeStatus: TradeStatus.ACTIVE },
    orderBy: { stockCode: 'asc' },
    select: { id: true },
  });

  await createLedgerHistory(user.account, now);

  const wishlists = await prisma.wishlist.createMany({
    data: stocks.slice(0, 4).map(({ id }, index) => ({
      userId: user.id,
      stockId: id,
      createDate: new Date(now - (index + 1) * DAY),
    })),
    skipDuplicates: true,
  });
  console.log(`관심상품: ${wishlists.count}개`);

  const views = await prisma.viewHistory.createMany({
    data: stocks.slice(0, 5).map(({ id }, index) => ({
      userId: user.id,
      stockId: id,
      modifiedDate: new Date(now - (index + 1) * HOUR),
    })),
    skipDuplicates: true,
  });
  console.log(`최근 본 종목: ${views.count}개`);

  if (
    (await prisma.searchHistory.count({ where: { userId: user.id } })) === 0
  ) {
    const keywords = ['Cloud', 'Pay', 'Data'];
    await prisma.searchHistory.createMany({
      data: keywords.map((keyword, index) => ({
        userId: user.id,
        keyword,
        modifiedDate: new Date(now - (index + 1) * HOUR),
      })),
    });
    console.log(`최근 검색어: ${keywords.length}개`);
  }

  await createListingApplications(user.id);
}

/**
 * 추가 지급 2번과 관리자 차감 1번. 초기 지급 이력만 있는 계좌에만 넣는다.
 * 마지막 지급이 24시간 전이라 지금 바로 추가 지급을 받을 수 있다.
 */
async function createLedgerHistory(
  account: { id: number; cash: bigint; _count: { ledgers: number } },
  now: number,
): Promise<void> {
  if (account._count.ledgers !== 1 || account.cash !== INITIAL_CASH) {
    console.log('포인트 이력: 이미 있음');
    return;
  }
  const changes = [
    { type: CashLedgerType.GRANT, amount: 100_000n, hoursAgo: 72 },
    { type: CashLedgerType.GRANT, amount: 100_000n, hoursAgo: 48 },
    { type: CashLedgerType.ADJUST, amount: -50_000n, hoursAgo: 25 },
  ];
  let balance = account.cash;
  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      balance += change.amount;
      await tx.cashLedger.create({
        data: {
          accountId: account.id,
          type: change.type,
          amount: change.amount,
          balanceAfter: balance,
          createDate: new Date(now - change.hoursAgo * HOUR),
        },
      });
    }
    await tx.account.update({
      where: { id: account.id },
      data: {
        cash: balance,
        lastPointGrantAt: new Date(now - 48 * HOUR),
        version: { increment: 1 },
      },
    });
  });
  console.log(`포인트 이력: ${changes.length}개`);
}

/**
 * 신청서 목록·상세·상태 화면용. 접수 이후 상태는 제출·심사 API가 아직 없어 seed로만 만든다.
 * 신청번호 형식은 제출 API에서 정해지면 맞춘다.
 */
async function createListingApplications(userId: number): Promise<void> {
  if ((await prisma.listingApplication.count({ where: { userId } })) > 0) {
    console.log('상장 신청서: 이미 있음');
    return;
  }
  const seeds: ListingApplicationSeed[] = [
    {
      name: 'TaskFlow',
      status: ListingApplicationStatus.DRAFT,
      currentStep: 2,
      daysAgo: 1,
    },
    {
      // 만료 5일 전이라 목록에서 만료 임박(expiresSoon)으로 보인다.
      name: 'MealKit',
      status: ListingApplicationStatus.DRAFT,
      currentStep: 3,
      daysAgo: 85,
    },
    {
      name: 'TripNote',
      status: ListingApplicationStatus.SUBMITTED,
      currentStep: 4,
      daysAgo: 3,
    },
    {
      name: 'PetCare',
      status: ListingApplicationStatus.UNDER_REVIEW,
      currentStep: 4,
      daysAgo: 6,
    },
    {
      name: 'CodeMate',
      status: ListingApplicationStatus.REVISION_REQUESTED,
      currentStep: 4,
      daysAgo: 10,
      reviewComment:
        'MAU 출처 자료가 집계 기간과 맞지 않습니다. 증빙 자료를 다시 올려 주세요.',
    },
    {
      name: 'BookClub',
      status: ListingApplicationStatus.APPROVED,
      currentStep: 4,
      daysAgo: 20,
    },
    {
      name: 'GameHub',
      status: ListingApplicationStatus.REJECTED,
      currentStep: 4,
      daysAgo: 25,
      reviewComment: '서비스 운영 기간이 상장 기준(6개월)에 미달합니다.',
    },
  ];
  for (const seed of seeds) {
    const item = await prisma.listingApplication.create({
      data: listingApplicationOf(userId, seed),
    });
    console.log(`상장 신청서: ${item.id} ${seed.name} (${seed.status})`);
  }
}

interface ListingApplicationSeed {
  name: string;
  status: ListingApplicationStatus;
  /** 입력을 마친 단계까지 draftData를 채운다. */
  currentStep: number;
  /** 마지막 저장(접수 이후 상태는 제출) 시점 */
  daysAgo: number;
  reviewComment?: string;
}

function listingApplicationOf(
  userId: number,
  seed: ListingApplicationSeed,
): Prisma.ListingApplicationUncheckedCreateInput {
  const now = Date.now();
  const savedAt = new Date(now - seed.daysAgo * DAY);
  const officialUrl = `https://${seed.name.toLowerCase()}.example.com`;
  const isSubmitted = seed.status !== ListingApplicationStatus.DRAFT;
  const steps: Record<string, string | number | null>[] = [
    {
      serviceName: seed.name,
      summary: `${seed.name}는 테스트용 상장 신청 서비스입니다.`,
      description: `${seed.name}의 상세 설명입니다. 프론트 화면 확인용 데이터입니다.`,
      sectorCode: 1,
      officialUrl,
      operatorName: `${seed.name} 주식회사`,
      managerName: '홍길동',
      businessEmail: `contact@${seed.name.toLowerCase()}.example.com`,
      contactPhone: '01012345678',
      logoCollectionId: null,
      mainImageCollectionId: null,
    },
    {
      desiredPrice: '10000',
      totalIssuedQuantity: '1000000',
      minOrderQuantity: '1',
      tickSize: '10',
      priceCalculationBasis: '최근 12개월 매출과 MAU를 기준으로 산정했습니다.',
      desiredListingDate: '2026-12-01',
    },
    {
      mau: '50000',
      mauSource: 'Google Analytics',
      mauReferenceMonth: '2026-09',
      dau: '10000',
      dauSource: 'Google Analytics',
      dauReferenceDate: '2026-09-30',
      revenue: '300000000',
      revenueStartDate: '2025-10-01',
      revenueEndDate: '2026-09-30',
      revenueSource: '세무 신고 자료',
      revenueExtractDate: '2026-10-05',
      transactionVolume: '1000000000',
      metricsStartDate: '2025-10-01',
      metricsEndDate: '2026-09-30',
      transactionVolumeBasis: '결제 완료 금액 합계',
      transactionVolumeSource: '내부 결제 시스템',
      transactionVolumeExtractDate: '2026-10-05',
    },
    {
      evidenceCollectionId: null,
      evidenceDescription: '서비스 지표와 매출 증빙 자료입니다.',
    },
  ];

  return {
    userId,
    status: seed.status,
    applicationNumber: isSubmitted
      ? `MOTU-${savedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${seed.name.toUpperCase()}`
      : null,
    submittedAt: isSubmitted ? savedAt : null,
    reviewComment: seed.reviewComment ?? null,
    revisionDeadline:
      seed.status === ListingApplicationStatus.REVISION_REQUESTED
        ? new Date(now + 5 * DAY)
        : null,
    serviceName: seed.name,
    officialUrl,
    normalizedOfficialUrl: normalizeListingUrl(officialUrl),
    currentStep: seed.currentStep,
    draftData: Object.assign({}, ...steps.slice(0, seed.currentStep)),
    lastSavedAt: savedAt,
    expiresAt: new Date(savedAt.getTime() + LISTING_DRAFT_LIFETIME_MS),
  };
}

/**
 * 시세 이력, 호가, motuuser의 보유 종목·거래내역·미체결 주문. 내용은 seed-market.ts에 있다.
 * 시장 조성 계정(motumaker, motutaker)의 비밀번호는 motuuser와 같다.
 */
async function createMarketActivity(): Promise<void> {
  await prisma.$executeRawUnsafe(
    marketSeedSql(await hash(seedUsers[1].password)),
  );
  console.log('테스트 거래: motumaker 계정이 이미 있으면 건너뜀');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
