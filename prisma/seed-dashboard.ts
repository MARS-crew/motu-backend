import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import {
  AdminActivityAction,
  AdminActivityTarget,
  AnomalyAction,
  AnomalyStatus,
  AnomalyType,
  CashLedgerType,
  InquirySource,
  InquiryStatus,
  InquiryType,
  ListingApplicationStatus,
  Prisma,
  PrismaClient,
  Role,
  TradeStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { INITIAL_CASH } from '../src/modules/accounts/accounts.constants.js';
import { inquiryCode } from '../src/modules/inquiries/inquiries.constants.js';

/**
 * 관리자 대시보드(ADM-DB-01) 확인용 테스트 데이터. production에서는 실행하지 않는다.
 *
 * 다시 실행하면 "지금"을 기준으로 빈 부분만 채운다. 대시보드는 지금 시각 기준(최근 1시간, 오늘, 어제 대비)이라
 * 며칠 지나 화면이 비면 `npm run db:seed:dashboard`를 다시 실행한다.
 * - 거래 추이: 거래봇 두 계정(motuflowa, motuflowb)이 거래 중 상품을 서로 사고판다. 최근 24시간은 5~15분,
 *   그 이전 30일은 1~3시간 간격이다. 가격은 직전 체결가에서 호가 1단계씩만 움직이고, 최근 24시간은
 *   호가창의 최우선 매수·매도 호가 사이에서만 체결해 호가창과 어긋나지 않는다. 차트 봉은 체결로 다시 계산한다.
 * - 전체 회원: 가입일이 30일에 걸쳐 나뉜 회원과 탈퇴 회원. 오늘 가입한 회원이 없으면 2명 더 만든다.
 * - 처리 대기: 비로그인 계정 문의(접수 3, 처리 중 2). 상장 심사 대기는 기본 seed의 접수·검토 중 신청서를 쓴다.
 * - 이상 거래: 미처리·확인중·처리완료. 오늘 탐지 건이 없으면 미처리 1건을 더 만든다.
 * - 전일 대비: 일별 통계(daily_stats)의 어제 행에 지금보다 조금 적은 마감 값을 넣는다.
 * - 최근 운영 이력: 최근 7일 관리자 활동 이력이 4건 미만이면 만든 데이터에 맞는 이력을 남긴다.
 *
 * 서버가 떠 있는 동안 실행했다면 시세가 화면에 반영되도록 서버를 다시 시작한다.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** 서로 사고파는 거래봇 계정 */
const FLOW_ACCOUNTS = [
  { loginId: 'motuflowa', nickname: '거래봇A', email: 'flowa@motu.test' },
  { loginId: 'motuflowb', nickname: '거래봇B', email: 'flowb@motu.test' },
] as const;
const FLOW_CASH = 500_000_000n;
const FLOW_HOLDING_QTY = 50_000n;

/** 대시보드 회원. 며칠 전에 가입했는지 */
const DASHBOARD_USER_DAYS_AGO = [
  29, 27, 25, 22, 20, 18, 15, 12, 10, 8, 6, 4, 3, 2, 1, 1, 0, 0,
];
/** 탈퇴 회원. 가입·탈퇴가 며칠 전인지 */
const WITHDRAWN_USERS = [
  { joinedDaysAgo: 21, withdrawnDaysAgo: 1, reason: '서비스 이용 빈도 감소' },
  { joinedDaysAgo: 14, withdrawnDaysAgo: 0, reason: '다른 서비스 이용' },
];
const DASHBOARD_USER_PREFIX = 'motudash';
const DASHBOARD_INQUIRY_DOMAIN = 'dash.motu.test';

export async function seedDashboard(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('대시보드 테스트 데이터는 production에서 만들지 않습니다.');
  }
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, loginId: 'motuadmin' },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('motuadmin 계정이 없습니다. 기본 seed를 먼저 실행하세요.');
  }

  await createFlowAccounts(prisma, passwordHash);
  const tradeCount = await createFlowTrades(prisma);
  console.log(`대시보드: 거래봇 체결 ${tradeCount}건 추가`);
  await createDashboardUsers(prisma, passwordHash);
  await createInquiries(prisma, admin.id);
  await createAnomalies(prisma, admin.id);
  await createDailyStats(prisma);
  await createActivityLogs(prisma, admin.id);
}

/** 거래봇 계정과 거래 중 상품의 보유 수량. 이미 있으면 빠진 보유 수량만 채운다. */
async function createFlowAccounts(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<void> {
  const stocks = await prisma.stock.findMany({
    where: { tradeStatus: TradeStatus.ACTIVE, isDeleted: false },
    select: { id: true, basePrice: true },
  });

  for (const flow of FLOW_ACCOUNTS) {
    let user = await prisma.user.findUnique({
      where: { loginId: flow.loginId },
      select: { account: { select: { id: true } } },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          ...flow,
          password: passwordHash,
          birthDate: new Date('2000-01-01'),
          termsAgreed: true,
          privacyAgreed: true,
          marketingAgreed: false,
          createDate: new Date(Date.now() - 60 * DAY),
          account: {
            create: {
              cash: FLOW_CASH,
              ledgers: {
                create: {
                  type: CashLedgerType.ADJUST,
                  amount: FLOW_CASH,
                  balanceAfter: FLOW_CASH,
                  createDate: new Date(Date.now() - 60 * DAY),
                },
              },
            },
          },
        },
        select: { account: { select: { id: true } } },
      });
      console.log(`생성: ${flow.loginId}`);
    }

    const accountId = user.account!.id;
    await prisma.holding.createMany({
      data: stocks.map((stock) => ({
        accountId,
        stockId: stock.id,
        qty: FLOW_HOLDING_QTY,
        totalAmount: FLOW_HOLDING_QTY * stock.basePrice,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * 거래봇끼리 체결을 쌓고 차트 봉을 다시 계산한다. 상품마다 거래봇의 마지막 체결 뒤부터 지금까지 채운다.
 * 정산 규칙(수수료 0.02% 버림, 매입원가 비례 차감)은 seed-market.ts와 같다.
 * @returns 추가한 체결 수
 */
async function createFlowTrades(prisma: PrismaClient): Promise<number> {
  const before = await prisma.trade.count();
  const loginIds = FLOW_ACCOUNTS.map((flow) => `'${flow.loginId}'`).join(', ');

  await prisma.$executeRawUnsafe(`
DO $motu$
DECLARE
  v_flow int[];
  v_stock record;
  v_at timestamptz;
  v_hour int;
  v_price bigint;
  v_bid bigint;
  v_ask bigint;
  v_qty bigint;
  v_notional bigint;
  v_fee bigint;
  v_buyer int;
  v_seller int;
  v_swap int;
  v_holding holdings%ROWTYPE;
  v_cost_basis bigint;
  v_cash bigint;
  v_buy_id bigint;
  v_sell_id bigint;
  v_trade_id bigint;
  v_stock_ids int[] := '{}';
BEGIN
  SELECT array_agg(a.account_id ORDER BY u.login_id) INTO v_flow
  FROM accounts a JOIN users u ON u.user_id = a.user_id
  WHERE u.login_id IN (${loginIds});

  FOR v_stock IN
    SELECT s.stock_id, s.price_tick_size AS tick, s.base_price, s.listing_date
    FROM stocks s
    WHERE s.trade_status = 'ACTIVE' AND NOT s.is_deleted
      AND (SELECT count(*) FROM holdings h WHERE h.stock_id = s.stock_id AND h.account_id = ANY (v_flow)) = 2
    ORDER BY s.stock_id
  LOOP
    SELECT max(t.create_date) INTO v_at
    FROM trades t JOIN orders o ON o.order_id = t.buy_order_id
    WHERE t.stock_id = v_stock.stock_id AND o.account_id = ANY (v_flow);
    v_at := greatest(coalesce(v_at, now() - interval '30 days'), v_stock.listing_date + interval '1 day');

    LOOP
      v_at := v_at + CASE WHEN v_at >= now() - interval '1 day'
        THEN interval '10 minutes' ELSE interval '2 hours' END * (0.5 + random());
      EXIT WHEN v_at >= now() - interval '30 seconds';

      -- 그 시각의 직전 체결가에서 호가 1단계 안으로 움직인다.
      SELECT price INTO v_price FROM trades
      WHERE stock_id = v_stock.stock_id AND create_date <= v_at
      ORDER BY create_date DESC, trade_id DESC LIMIT 1;
      v_price := coalesce(v_price, v_stock.base_price) + v_stock.tick * (floor(random() * 3)::int - 1);
      IF v_at >= now() - interval '1 day' THEN
        SELECT max(price) INTO v_bid FROM orders
        WHERE stock_id = v_stock.stock_id AND side = 'BUY' AND status IN ('ACCEPTED', 'PARTIAL');
        SELECT min(price) INTO v_ask FROM orders
        WHERE stock_id = v_stock.stock_id AND side = 'SELL' AND status IN ('ACCEPTED', 'PARTIAL');
        IF v_bid IS NOT NULL THEN v_price := greatest(v_price, v_bid); END IF;
        IF v_ask IS NOT NULL THEN v_price := least(v_price, v_ask); END IF;
      END IF;
      v_price := greatest(v_price, v_stock.tick);

      -- 한국 시간 9~18시는 거래량이 많다.
      v_hour := extract(hour FROM v_at AT TIME ZONE 'Asia/Seoul');
      v_qty := CASE WHEN v_hour BETWEEN 9 AND 17
        THEN 20 + floor(random() * 60) ELSE 5 + floor(random() * 25) END;
      v_notional := v_price * v_qty;
      v_fee := v_notional * 2 / 10000;

      IF random() < 0.5 THEN
        v_buyer := v_flow[1]; v_seller := v_flow[2];
      ELSE
        v_buyer := v_flow[2]; v_seller := v_flow[1];
      END IF;
      SELECT * INTO v_holding FROM holdings WHERE account_id = v_seller AND stock_id = v_stock.stock_id;
      IF v_holding.holding_id IS NULL OR v_holding.qty - v_holding.locked_qty < v_qty THEN
        v_swap := v_buyer; v_buyer := v_seller; v_seller := v_swap;
        SELECT * INTO v_holding FROM holdings WHERE account_id = v_seller AND stock_id = v_stock.stock_id;
        CONTINUE WHEN v_holding.holding_id IS NULL OR v_holding.qty - v_holding.locked_qty < v_qty;
      END IF;
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM accounts WHERE account_id = v_buyer AND cash - locked_cash >= v_notional + v_fee
      );
      v_cost_basis := v_holding.total_amount * v_qty / v_holding.qty;

      INSERT INTO orders (account_id, stock_id, client_order_id, side, price, qty, filled_qty, status, create_date, modified_date)
      VALUES (v_seller, v_stock.stock_id, gen_random_uuid(), 'SELL', v_price, v_qty, v_qty, 'FILLED', v_at, v_at)
      RETURNING order_id INTO v_sell_id;
      INSERT INTO orders (account_id, stock_id, client_order_id, side, price, qty, filled_qty, status, create_date, modified_date)
      VALUES (v_buyer, v_stock.stock_id, gen_random_uuid(), 'BUY', v_price, v_qty, v_qty, 'FILLED', v_at, v_at)
      RETURNING order_id INTO v_buy_id;
      INSERT INTO trades (stock_id, buy_order_id, sell_order_id, price, qty, create_date)
      VALUES (v_stock.stock_id, v_buy_id, v_sell_id, v_price, v_qty, v_at)
      RETURNING trade_id INTO v_trade_id;

      UPDATE accounts SET cash = cash - (v_notional + v_fee), version = version + 1, modified_date = now()
      WHERE account_id = v_buyer
      RETURNING cash INTO v_cash;
      INSERT INTO holdings (account_id, stock_id, qty, total_amount, modified_date)
      VALUES (v_buyer, v_stock.stock_id, v_qty, v_notional + v_fee, now())
      ON CONFLICT (account_id, stock_id) DO UPDATE
      SET qty = holdings.qty + EXCLUDED.qty, total_amount = holdings.total_amount + EXCLUDED.total_amount,
        modified_date = now();
      INSERT INTO cash_ledgers (account_id, trade_id, type, amount, fee, balance_after, create_date)
      VALUES (v_buyer, v_trade_id, 'BUY', -(v_notional + v_fee), v_fee, v_cash, v_at);

      UPDATE accounts SET cash = cash + (v_notional - v_fee), version = version + 1, modified_date = now()
      WHERE account_id = v_seller
      RETURNING cash INTO v_cash;
      UPDATE holdings SET qty = qty - v_qty, total_amount = total_amount - v_cost_basis, modified_date = now()
      WHERE holding_id = v_holding.holding_id;
      INSERT INTO cash_ledgers (account_id, trade_id, type, amount, fee, realized_pnl, balance_after, create_date)
      VALUES (v_seller, v_trade_id, 'SELL', v_notional - v_fee, v_fee,
        v_notional - v_fee - v_cost_basis, v_cash, v_at);

      IF NOT v_stock.stock_id = ANY (v_stock_ids) THEN
        v_stock_ids := v_stock_ids || v_stock.stock_id;
      END IF;
    END LOOP;
  END LOOP;

  -- 차트 봉을 체결로 다시 계산한다. 일·주(월요일)·월 봉 경계는 한국 시간 00시다. (seed-market.ts와 같음)
  DELETE FROM charts WHERE stock_id = ANY (v_stock_ids);
  INSERT INTO charts (stock_id, candle_interval, candle_time, open_price, high_price, low_price, close_price, volume, trade_amount)
  SELECT t.stock_id, i.unit::chart_interval, b.candle_time,
    (array_agg(t.price ORDER BY t.create_date, t.trade_id))[1],
    max(t.price), min(t.price),
    (array_agg(t.price ORDER BY t.create_date DESC, t.trade_id DESC))[1],
    sum(t.qty), sum(t.price * t.qty)
  FROM trades t
  CROSS JOIN (VALUES ('MINUTE'), ('HOUR'), ('DAY'), ('WEEK'), ('MONTH')) AS i(unit)
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN i.unit IN ('MINUTE', 'HOUR')
        THEN date_trunc(lower(i.unit), t.create_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      ELSE date_trunc(lower(i.unit), t.create_date AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
    END AS candle_time
  ) b
  WHERE t.stock_id = ANY (v_stock_ids)
  GROUP BY t.stock_id, i.unit, b.candle_time;
END
$motu$;`);

  return (await prisma.trade.count()) - before;
}

/**
 * 가입일이 나뉜 회원과 탈퇴 회원. 처음 실행할 때 만들고, 다시 실행했을 때 오늘 가입한 회원이 없으면 2명을 더 만든다.
 */
async function createDashboardUsers(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<void> {
  const existing = await prisma.user.findMany({
    where: { loginId: { startsWith: DASHBOARD_USER_PREFIX } },
    select: { loginId: true, createDate: true },
  });
  const now = Date.now();
  const todayStart = kstDayStart(now);
  let daysAgoList: number[];
  if (existing.length === 0) {
    daysAgoList = DASHBOARD_USER_DAYS_AGO;
  } else if (existing.every((user) => user.createDate.getTime() < todayStart)) {
    daysAgoList = [0, 0];
  } else {
    return;
  }

  let next =
    Math.max(
      0,
      ...existing.map((user) =>
        Number(user.loginId.slice(DASHBOARD_USER_PREFIX.length)),
      ),
    ) + 1;
  for (const daysAgo of daysAgoList) {
    const createDate = joinedAt(now, daysAgo);
    await createMember(prisma, passwordHash, next, createDate);
    next += 1;
  }
  console.log(`대시보드: 회원 ${daysAgoList.length}명 추가`);

  if (existing.length > 0) {
    return;
  }
  for (const withdrawn of WITHDRAWN_USERS) {
    const user = await createMember(
      prisma,
      passwordHash,
      next,
      joinedAt(now, withdrawn.joinedDaysAgo),
    );
    next += 1;
    const deletedDate = joinedAt(now, withdrawn.withdrawnDaysAgo);
    // 회원 탈퇴 API와 같게 개인정보를 지우고 아이디를 풀어 준다.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginId: `withdrawn_${user.id}`,
        email: null,
        nickname: null,
        birthDate: null,
        phoneNumber: null,
        userStatus: UserStatus.WITHDRAWN,
        reason: withdrawn.reason,
        deletedDate,
        isDeleted: true,
        account: {
          update: {
            cash: 0n,
            ledgers: {
              create: {
                type: CashLedgerType.WITHDRAWAL,
                amount: -INITIAL_CASH,
                balanceAfter: 0n,
                createDate: deletedDate,
              },
            },
          },
        },
      },
    });
  }
  console.log(`대시보드: 탈퇴 회원 ${WITHDRAWN_USERS.length}명 추가`);
}

async function createMember(
  prisma: PrismaClient,
  passwordHash: string,
  index: number,
  createDate: Date,
): Promise<{ id: number }> {
  const suffix = String(index).padStart(2, '0');
  return prisma.user.create({
    data: {
      loginId: `${DASHBOARD_USER_PREFIX}${suffix}`,
      password: passwordHash,
      email: `dash${suffix}@motu.test`,
      nickname: `대시보드${suffix}`,
      birthDate: new Date('2000-01-01'),
      termsAgreed: true,
      privacyAgreed: true,
      marketingAgreed: false,
      createDate,
      account: {
        create: {
          cash: INITIAL_CASH,
          ledgers: {
            create: {
              type: CashLedgerType.DEPOSIT,
              amount: INITIAL_CASH,
              balanceAfter: INITIAL_CASH,
              createDate,
            },
          },
        },
      },
    },
    select: { id: true },
  });
}

/** 처리 대기 카드의 계정 문의. 접수 3건, 처리 중 2건. 이미 있으면 건너뛴다. */
async function createInquiries(
  prisma: PrismaClient,
  adminId: number,
): Promise<void> {
  const exists = await prisma.inquiry.count({
    where: { replyEmail: { endsWith: `@${DASHBOARD_INQUIRY_DOMAIN}` } },
  });
  if (exists > 0) {
    return;
  }

  const now = Date.now();
  const seeds = [
    {
      type: InquiryType.LOGIN_FAILED_LOCKED,
      title: '계정 잠금 문의',
      content:
        '비밀번호를 여러 번 틀려 계정이 잠겼습니다. 잠금 해제 부탁드립니다.',
      hoursAgo: 1,
      status: InquiryStatus.SUBMITTED,
    },
    {
      type: InquiryType.PHONE_UNAVAILABLE,
      title: '등록 휴대폰 사용 불가 문의',
      content: '휴대폰 번호가 바뀌어 2차 보안 인증번호를 받을 수 없습니다.',
      hoursAgo: 5,
      status: InquiryStatus.SUBMITTED,
    },
    {
      type: InquiryType.SUSPENDED,
      title: '계정 정지 문의',
      content: '계정이 정지된 이유를 알고 싶습니다.',
      hoursAgo: 20,
      status: InquiryStatus.SUBMITTED,
    },
    {
      type: InquiryType.LOGIN_FAILED_LOCKED,
      title: '계정 잠금 문의',
      content: '로그인이 계속 실패하고 잠금 안내가 나옵니다.',
      hoursAgo: 30,
      status: InquiryStatus.IN_PROGRESS,
    },
    {
      type: InquiryType.SUSPENDED,
      title: '계정 정지 문의',
      content: '정지 해제 절차를 안내해 주세요.',
      hoursAgo: 52,
      status: InquiryStatus.IN_PROGRESS,
    },
  ];

  for (const [index, seed] of seeds.entries()) {
    const createDate = new Date(now - seed.hoursAgo * HOUR);
    const inProgress = seed.status === InquiryStatus.IN_PROGRESS;
    await prisma.inquiry.create({
      data: {
        source: InquirySource.PUBLIC_ACCOUNT_AUTH,
        inquiryCode: inquiryCode(),
        inquiryType: seed.type,
        title: seed.title,
        content: seed.content,
        status: seed.status,
        replyEmail: `user${index + 1}@${DASHBOARD_INQUIRY_DOMAIN}`,
        createDate,
        assignedAdminId: inProgress ? adminId : null,
        processingStartedAt: inProgress
          ? new Date(createDate.getTime() + 2 * HOUR)
          : null,
      },
    });
  }
  console.log(`대시보드: 계정 문의 ${seeds.length}건 추가`);
}

/**
 * 이상 거래 카드. 처음 실행할 때 미처리 3·확인중 2·처리완료 2건을 만들고,
 * 다시 실행했을 때 오늘 탐지 건이 없으면 미처리 1건을 더 만든다.
 */
async function createAnomalies(
  prisma: PrismaClient,
  adminId: number,
): Promise<void> {
  const flowUser = await prisma.user.findUniqueOrThrow({
    where: { loginId: FLOW_ACCOUNTS[0].loginId },
    select: { id: true, account: { select: { id: true } } },
  });
  const trades = await prisma.trade.findMany({
    where: { buyOrder: { accountId: flowUser.account!.id } },
    orderBy: { id: 'desc' },
    take: 20,
    select: {
      id: true,
      stockId: true,
      price: true,
      qty: true,
      buyOrderId: true,
      stock: { select: { listedShares: true } },
    },
  });
  if (trades.length < 7) {
    console.log('대시보드: 거래봇 체결이 부족해 이상 거래를 만들지 않음');
    return;
  }

  const now = Date.now();
  const existing = await prisma.anomaly.count({
    where: { userId: flowUser.id },
  });
  const hasToday = await prisma.anomaly.count({
    where: {
      userId: flowUser.id,
      detectedDate: { gte: new Date(kstDayStart(now)) },
    },
  });
  if (existing > 0 && hasToday > 0) {
    return;
  }

  const plans: {
    status: AnomalyStatus;
    hoursAgo: number;
    type: AnomalyType;
  }[] =
    existing === 0
      ? [
          {
            status: AnomalyStatus.PENDING,
            hoursAgo: 0.5,
            type: AnomalyType.LARGE_ORDER,
          },
          {
            status: AnomalyStatus.PENDING,
            hoursAgo: 2,
            type: AnomalyType.REPEATED_ORDER,
          },
          {
            status: AnomalyStatus.PENDING,
            hoursAgo: 4,
            type: AnomalyType.ABNORMAL_PRICE,
          },
          {
            status: AnomalyStatus.REVIEWING,
            hoursAgo: 8,
            type: AnomalyType.LARGE_ORDER,
          },
          {
            status: AnomalyStatus.REVIEWING,
            hoursAgo: 27,
            type: AnomalyType.ABNORMAL_PRICE,
          },
          {
            status: AnomalyStatus.RESOLVED,
            hoursAgo: 30,
            type: AnomalyType.REPEATED_ORDER,
          },
          {
            status: AnomalyStatus.RESOLVED,
            hoursAgo: 50,
            type: AnomalyType.LARGE_ORDER,
          },
        ]
      : [
          {
            status: AnomalyStatus.PENDING,
            hoursAgo: 0.2,
            type: AnomalyType.LARGE_ORDER,
          },
        ];

  for (const [index, plan] of plans.entries()) {
    const trade = trades[index];
    const detectedDate = new Date(now - plan.hoursAgo * HOUR);
    const resolved = plan.status === AnomalyStatus.RESOLVED;
    const data: Prisma.AnomalyUncheckedCreateInput = {
      type: plan.type,
      status: plan.status,
      stockId: trade.stockId,
      userId: flowUser.id,
      detectedDate,
      ...(resolved && {
        action: AnomalyAction.NO_ISSUE,
        actionReason: '거래봇 테스트 주문으로 확인',
        handledById: adminId,
        handledDate: new Date(detectedDate.getTime() + HOUR),
      }),
      ...anomalyDetailOf(plan.type, trade, detectedDate),
    };
    // 비정상 가격 체결은 체결마다 한 번만 남길 수 있다. 이미 있으면 건너뛴다.
    await prisma.anomaly.create({ data }).catch((error: unknown) => {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    });
  }
  console.log(`대시보드: 이상 거래 ${plans.length}건 추가`);
}

function anomalyDetailOf(
  type: AnomalyType,
  trade: {
    id: bigint;
    price: bigint;
    qty: bigint;
    buyOrderId: bigint;
    stock: { listedShares: bigint };
  },
  detectedDate: Date,
): Pick<
  Prisma.AnomalyUncheckedCreateInput,
  'orderId' | 'tradeId' | 'errorCode' | 'errorMessage' | 'evidence'
> {
  switch (type) {
    case AnomalyType.LARGE_ORDER: {
      const orderQty = trade.stock.listedShares / 50n;
      return {
        orderId: trade.buyOrderId,
        errorCode: 'LARGE_ORDER',
        errorMessage: '대량 주문 탐지',
        evidence: {
          side: 'BUY',
          orderPrice: Number(trade.price),
          orderQty: Number(orderQty),
          listedShares: Number(trade.stock.listedShares),
          sharePercent:
            Number((orderQty * 10_000n) / trade.stock.listedShares) / 100,
          thresholdPercent: 1,
        },
      };
    }
    case AnomalyType.REPEATED_ORDER:
      return {
        orderId: trade.buyOrderId,
        errorCode: 'REPEATED_ORDER',
        errorMessage: '반복 주문 탐지',
        evidence: {
          orderCount: 12,
          windowSeconds: 60,
          minCount: 10,
          firstOrderDate: new Date(
            detectedDate.getTime() - 50_000,
          ).toISOString(),
          lastOrderDate: detectedDate.toISOString(),
        },
      };
    default: {
      const basePrice = (trade.price * 10n) / 13n;
      return {
        orderId: trade.buyOrderId,
        tradeId: trade.id,
        errorCode: 'PRICE_DEVIATION',
        errorMessage: '가격 편차 초과',
        evidence: {
          orderQty: Number(trade.qty),
          filledQty: Number(trade.qty),
          basePrice: Number(basePrice),
          tradePrice: Number(trade.price),
          deviationPercent:
            Number(((trade.price - basePrice) * 10_000n) / basePrice) / 100,
          assetDifference: Number((basePrice - trade.price) * trade.qty),
        },
      };
    }
  }
}

/**
 * 최근 30일 일별 통계. 거래량·거래대금은 일봉 합계이고, 어제 행에는 전일 대비가 보이도록
 * 지금보다 조금 적은 마감 값을 넣는다. 그 이전 날의 마감 값은 배치와 같이 비워 둔다.
 */
async function createDailyStats(prisma: PrismaClient): Promise<void> {
  const [listed, pendingListing, pendingInquiry, pendingAnomaly] =
    await Promise.all([
      prisma.stock.count({
        where: {
          isDeleted: false,
          tradeStatus: { in: [TradeStatus.ACTIVE, TradeStatus.PAUSED] },
        },
      }),
      prisma.listingApplication.count({
        where: {
          deletedDate: null,
          status: {
            in: [
              ListingApplicationStatus.SUBMITTED,
              ListingApplicationStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
      prisma.inquiry.count({
        where: {
          status: { in: [InquiryStatus.SUBMITTED, InquiryStatus.IN_PROGRESS] },
        },
      }),
      prisma.anomaly.count({
        where: {
          status: { in: [AnomalyStatus.PENDING, AnomalyStatus.REVIEWING] },
        },
      }),
    ]);

  await prisma.$executeRaw`
    INSERT INTO daily_stats (stat_date, trade_volume, trade_amount, listed_stock_count,
      pending_listing_count, pending_inquiry_count, pending_anomaly_count)
    SELECT d.stat_date,
      coalesce(sum(c.volume), 0), coalesce(sum(c.trade_amount), 0),
      CASE WHEN d.days_ago = 1 THEN ${Math.max(listed - 1, 0)}::int END,
      CASE WHEN d.days_ago = 1 THEN ${Math.max(pendingListing - 1, 0)}::int END,
      CASE WHEN d.days_ago = 1 THEN ${Math.max(pendingInquiry - 2, 0)}::int END,
      CASE WHEN d.days_ago = 1 THEN ${Math.max(pendingAnomaly - 2, 0)}::int END
    FROM (
      SELECT (now() AT TIME ZONE 'Asia/Seoul')::date - n AS stat_date, n AS days_ago
      FROM generate_series(1, 30) AS n
    ) d
    LEFT JOIN charts c
      ON c.candle_interval = 'DAY'
      AND (c.candle_time AT TIME ZONE 'Asia/Seoul')::date = d.stat_date
    GROUP BY d.stat_date, d.days_ago
    ON CONFLICT (stat_date) DO UPDATE SET
      trade_volume = EXCLUDED.trade_volume,
      trade_amount = EXCLUDED.trade_amount,
      listed_stock_count = coalesce(EXCLUDED.listed_stock_count, daily_stats.listed_stock_count),
      pending_listing_count = coalesce(EXCLUDED.pending_listing_count, daily_stats.pending_listing_count),
      pending_inquiry_count = coalesce(EXCLUDED.pending_inquiry_count, daily_stats.pending_inquiry_count),
      pending_anomaly_count = coalesce(EXCLUDED.pending_anomaly_count, daily_stats.pending_anomaly_count)
  `;
  console.log('대시보드: 최근 30일 일별 통계 갱신');
}

/** 최근 운영 이력. 최근 7일 이력이 4건 미만이면 만든 데이터에 맞는 이력 5건을 남긴다. */
async function createActivityLogs(
  prisma: PrismaClient,
  adminId: number,
): Promise<void> {
  const now = Date.now();
  const recent = await prisma.adminActivityLog.count({
    where: { createDate: { gte: new Date(now - 7 * DAY) } },
  });
  if (recent >= 4) {
    return;
  }

  const [inquiry, resolved, application, notice, stock] = await Promise.all([
    prisma.inquiry.findFirst({
      where: {
        status: InquiryStatus.IN_PROGRESS,
        replyEmail: { endsWith: `@${DASHBOARD_INQUIRY_DOMAIN}` },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.anomaly.findFirst({
      where: { status: AnomalyStatus.RESOLVED },
      orderBy: { id: 'desc' },
    }),
    prisma.listingApplication.findFirst({
      where: { status: ListingApplicationStatus.UNDER_REVIEW },
    }),
    prisma.notice.findFirst({ orderBy: { id: 'desc' } }),
    prisma.stock.findFirst({
      where: { tradeStatus: TradeStatus.ACTIVE, isDeleted: false },
      orderBy: { id: 'asc' },
    }),
  ]);

  const logs: Prisma.AdminActivityLogCreateManyInput[] = [];
  const add = (
    hoursAgo: number,
    log: Omit<Prisma.AdminActivityLogCreateManyInput, 'adminId' | 'createDate'>,
  ) =>
    logs.push({
      ...log,
      adminId,
      createDate: new Date(now - hoursAgo * HOUR),
      ipAddress: '127.0.0.1',
    });

  if (inquiry) {
    add(1, {
      targetType: AdminActivityTarget.INQUIRY,
      targetId: BigInt(inquiry.id),
      targetLabel: inquiry.inquiryCode,
      action: AdminActivityAction.INQUIRY_START,
      summary: '접수 → 처리 중',
      beforeValue: { status: InquiryStatus.SUBMITTED },
      afterValue: { status: InquiryStatus.IN_PROGRESS },
    });
  }
  if (resolved) {
    add(6, {
      targetType: AdminActivityTarget.ANOMALY,
      targetId: BigInt(resolved.id),
      targetLabel: `이상 거래 #${resolved.id}`,
      action: AdminActivityAction.ANOMALY_ACTION,
      summary: '확인중 → 처리완료 (이상 없음)',
      reason: resolved.actionReason,
      beforeValue: { status: AnomalyStatus.REVIEWING },
      afterValue: {
        status: AnomalyStatus.RESOLVED,
        action: AnomalyAction.NO_ISSUE,
      },
    });
  }
  if (application) {
    add(26, {
      targetType: AdminActivityTarget.LISTING_APPLICATION,
      targetId: BigInt(application.id),
      targetLabel: application.applicationNumber ?? `신청서 #${application.id}`,
      action: AdminActivityAction.LISTING_REVIEW_START,
      summary: '접수 → 검토 중',
      beforeValue: { status: ListingApplicationStatus.SUBMITTED },
      afterValue: { status: ListingApplicationStatus.UNDER_REVIEW },
    });
  }
  if (notice) {
    add(50, {
      targetType: AdminActivityTarget.NOTICE,
      targetId: BigInt(notice.id),
      targetLabel: notice.title.slice(0, 100),
      action: AdminActivityAction.NOTICE_UPDATE,
      summary: '공지사항 수정',
    });
  }
  if (stock) {
    add(100, {
      targetType: AdminActivityTarget.STOCK,
      targetId: BigInt(stock.id),
      targetLabel: stock.stockCode,
      action: AdminActivityAction.STOCK_UPDATE,
      summary: '상품 정보 수정',
    });
  }

  await prisma.adminActivityLog.createMany({ data: logs });
  console.log(`대시보드: 관리자 활동 이력 ${logs.length}건 추가`);
}

/** 한국 시간 오늘 00시 (ms) */
function kstDayStart(now: number): number {
  const kst = 9 * HOUR;
  return Math.floor((now + kst) / DAY) * DAY - kst;
}

/** 며칠 전 가입 시각. 오늘이면 지금보다 조금 이르게, 그 이전은 그날 낮 시간으로 둔다. */
function joinedAt(now: number, daysAgo: number): Date {
  if (daysAgo === 0) {
    return new Date(Math.max(kstDayStart(now), now - 30 * 60 * 1000));
  }
  return new Date(kstDayStart(now) - daysAgo * DAY + 11 * HOUR);
}

// `npm run db:seed:dashboard`로 따로 실행할 때
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await seedDashboard(
      prisma,
      await hash(process.env.SEED_USER_PASSWORD ?? 'motuuser1!'),
    );
  } finally {
    await prisma.$disconnect();
  }
}
