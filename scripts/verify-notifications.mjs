// npm run build 후 실행. localhost의 별도 일회용 DB에서 HTTP/트랜잭션/배치를 검증하고 DB를 정리한다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import argon2 from 'argon2';

const originalUrl = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(originalUrl.hostname),
  '로컬 DB만 허용합니다.',
);
const databaseName = `motu_notifications_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const testUrl = new URL(originalUrl);
testUrl.pathname = `/${databaseName}`;
const root = new pg.Client({ connectionString: originalUrl.toString() });
let app;
let client;
let createdDatabase = false;
let checks = 0;
let base;
function check(condition, message) {
  assert(condition, message);
  checks++;
}

async function call(path, token, method = 'GET', body, status = 200, code) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  if (code) assert.equal(result.error?.code, code, JSON.stringify(result));
  checks++;
  return status < 400 ? result.data : result.error;
}

try {
  await root.connect();
  await root.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';
  process.env.BREVO_API_KEY = '';
  process.env.FILE_STORAGE_DRIVER = 'local';
  await promisify(execFile)(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: process.env, timeout: 60000 },
  );
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { setupApp } = await import('../dist/setup-app.js');
  const { setupSwagger } = await import('../dist/config/swagger.config.js');
  const { PrismaService } =
    await import('../dist/common/prisma/prisma.service.js');
  const { NotificationsService } =
    await import('../dist/modules/notifications/notifications.service.js');
  const { ListingDraftNotificationsService } =
    await import('../dist/modules/listing-applications/listing-draft-notifications.service.js');
  const { ListingApplicationsService } =
    await import('../dist/modules/listing-applications/listing-applications.service.js');
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  setupSwagger(app);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  const prisma = app.get(PrismaService);
  const notifications = app.get(NotificationsService);
  const warnings = app.get(ListingDraftNotificationsService);
  const applications = app.get(ListingApplicationsService);
  client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  // 시작 시 sweep가 빈 DB에 대해 끝난 뒤 테스트 fixture를 만든다.
  await setTimeout(100);
  const password = 'Notification1!';
  const hash = await argon2.hash(password);
  const users = [];
  for (const index of [0, 1]) {
    const user = await prisma.user.create({
      data: {
        loginId: `notifuser${index}`,
        password: hash,
        email: `notif${index}@motu.test`,
        nickname: `알림테스트${index}`,
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
      },
    });
    const login = await call('/auth/login', null, 'POST', {
      loginId: user.loginId,
      password,
    });
    users.push({ ...user, token: login.accessToken });
  }
  const [a, b] = users;
  await call('/notifications', null, 'GET', undefined, 401);
  await call('/notifications/unread-count', null, 'GET', undefined, 401);
  await call('/notifications/1/read', null, 'PATCH', undefined, 401);
  check(
    (await call('/notifications', a.token)).totalCount === 0,
    '빈 알림 목록',
  );
  check(
    (await call('/notifications/unread-count', a.token)).unreadCount === 0,
    '빈 카운트',
  );
  const time = new Date(Date.now() - 60000);
  const order = {
    userId: a.id,
    tradeId: '9007199254740993',
    orderId: '9007199254740994',
    stockId: 1,
    stockName: 'PLI',
    side: 'BUY',
    quantity: '20',
    price: '4350',
    occurredAt: time,
  };
  const duplicate = await Promise.all(
    Array.from({ length: 10 }, () => notifications.createOrderFilled(order)),
  );
  check(
    duplicate.filter((item) => item.created).length === 1 &&
      new Set(duplicate.map((item) => item.notification.id)).size === 1,
    '동시 체결 알림 중복 방지',
  );
  const buyId = duplicate[0].notification.id;
  await notifications.createOrderFilled({
    ...order,
    userId: b.id,
    orderId: 'seller-1',
    side: 'SELL',
  });
  await notifications.createOrderFilled({
    ...order,
    tradeId: 'second-fill',
    quantity: '5',
  });
  await notifications.createOrderFilled({
    ...order,
    tradeId: 'sell-fill',
    side: 'SELL',
  });
  const price = {
    userId: a.id,
    alertId: '1',
    revision: 'version-1',
    stockId: 1,
    stockName: 'PLI',
    targetPrice: '7000',
    reachedPrice: '7100',
    occurredAt: new Date(),
  };
  const prices = await Promise.all(
    Array.from({ length: 10 }, () =>
      notifications.createTargetPriceReached(price),
    ),
  );
  check(
    prices.filter((item) => item.created).length === 1,
    '같은 목표가 설정 버전 최초 한 번',
  );
  await notifications.createTargetPriceReached({
    ...price,
    revision: 'version-2',
  });
  const huge = await notifications.createOrderFilled({
    ...order,
    tradeId: 'max-bigint',
    quantity: '9007199254740993',
    price: '9223372036854775807',
  });
  check(
    huge.notification.payload.price === '9223372036854775807',
    '큰 금액 문자열 정밀도 보존',
  );
  const beforeRollback = (await notifications.list(a.id, 1, 50)).totalCount;
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await notifications.createOrderFilled(
        { ...order, tradeId: 'rolled-back' },
        tx,
      );
      throw new Error('rollback');
    }),
    /rollback/,
  );
  check(
    (await notifications.list(a.id, 1, 50)).totalCount === beforeRollback,
    '생산자 트랜잭션 실패 시 알림 롤백',
  );
  await assert.rejects(async () =>
    notifications.createTargetPriceReached({ ...price, targetPrice: '0' }),
  );
  check(
    (await notifications.list(a.id, 1, 50)).totalCount === beforeRollback,
    '잘못된 이벤트 저장 차단',
  );
  const list = await call('/notifications?size=50', a.token);
  check(
    list.totalCount === 6 && list.items.length === 6,
    '부분 체결과 설정 수정 버전은 별도 알림',
  );
  check(
    list.items.every(
      (item, index, all) =>
        index === 0 ||
        Date.parse(all[index - 1].createDate) > Date.parse(item.createDate) ||
        (all[index - 1].createDate === item.createDate &&
          all[index - 1].id > item.id),
    ),
    '최신순 및 동일 시각 ID 순',
  );
  check(
    list.items.every(
      (item) => !item.isRead && !('userId' in item) && !('eventKey' in item),
    ),
    '목록 조회는 읽음 변경·내부 식별자 노출 없음',
  );
  check(
    (await call('/notifications/unread-count', a.token)).unreadCount === 6,
    '미확인 수',
  );
  check(
    (await call('/notifications', b.token)).items[0].content.includes('매도'),
    '상대방 회원의 매도 알림',
  );
  await call(
    `/notifications/${buyId}/read`,
    b.token,
    'PATCH',
    undefined,
    404,
    'NOTIFICATION_NOT_FOUND',
  );
  await call(
    '/notifications?userId=2',
    a.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  const invalid = await call(
    '/notifications?page=0',
    a.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  check(
    invalid.details.every((message) =>
      message.includes('요청 값이 올바르지 않습니다.'),
    ),
    'DTO 검증 한글',
  );
  await call(
    '/notifications?size=51',
    a.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  await call(
    '/notifications/not-a-number/read',
    a.token,
    'PATCH',
    undefined,
    400,
    'BAD_REQUEST',
  );
  await call(
    '/notifications/2147483648/read',
    a.token,
    'PATCH',
    undefined,
    404,
    'NOTIFICATION_NOT_FOUND',
  );
  await call(
    '/notifications/2147483647/read',
    a.token,
    'PATCH',
    undefined,
    404,
    'NOTIFICATION_NOT_FOUND',
  );
  const firstRead = await call(
    `/notifications/${buyId}/read`,
    a.token,
    'PATCH',
  );
  check(firstRead.isRead && firstRead.readAt, '선택한 알림 읽음');
  const readAgain = await Promise.all(
    Array.from({ length: 5 }, () =>
      call(`/notifications/${buyId}/read`, a.token, 'PATCH'),
    ),
  );
  check(
    readAgain.every((item) => item.readAt === firstRead.readAt),
    '동시 재요청에도 최초 읽음 시각 유지',
  );
  await notifications.createOrderFilled(order);
  check(
    (await call('/notifications/unread-count', a.token)).unreadCount === 5,
    '이벤트 재전송이 읽음 상태와 미확인 수를 바꾸지 않음',
  );
  const page = await call('/notifications?page=2&size=2', a.token);
  check(
    page.items.length === 2 &&
      page.totalCount === 6 &&
      page.items[0].id === list.items[2].id,
    '페이지네이션',
  );
  check(
    (await call('/notifications?page=100&size=20', a.token)).items.length === 0,
    '빈 후속 페이지',
  );

  await prisma.notification.deleteMany();
  const now = Date.now();
  const draft = async (days, patch = {}) =>
    prisma.listingApplication.create({
      data: {
        userId: a.id,
        serviceName: '경고 테스트',
        expiresAt: new Date(now + days * 86400000),
        lastSavedAt: new Date(now - (90 - days) * 86400000),
        ...patch,
      },
    });
  const due = await draft(7);
  await draft(7 + 1 / 24);
  await draft(-1);
  await draft(0);
  await draft(3, { deletedDate: new Date() });
  await draft(3, { status: 'SUBMITTED' });
  await draft(3, { status: 'EXPIRED' });
  const catchup = await draft(2);
  const workerTwo = new ListingDraftNotificationsService(prisma, notifications);
  const warningCounts = await Promise.all([
    warnings.notifyExpiringDrafts(),
    workerTwo.notifyExpiringDrafts(),
  ]);
  check(
    warningCounts.reduce((sum, count) => sum + count, 0) === 2,
    '여러 인스턴스 D-7·중단 후 재개 안내 1회',
  );
  const warningList = await call('/notifications', a.token);
  check(
    warningList.totalCount === 2 &&
      warningList.items.every((item) => item.type === 'LISTING_DRAFT_EXPIRING'),
    '만료·삭제·접수·7일 초과 신청서 제외',
  );
  check(
    new Set(warningList.items.map((item) => item.payload.applicationId)).has(
      catchup.id,
    ),
    '중단 기간 후 유효한 7일 이내 경고 처리',
  );
  check((await warnings.notifyExpiringDrafts()) === 0, '배치 재실행 중복 없음');
  await applications.expireDueDrafts();
  check(
    (await prisma.listingApplication.count({
      where: { status: 'EXPIRED', expiresAt: { lte: new Date() } },
    })) === 2,
    '기존 만료 배치 유지',
  );
  // 이미 보낸 안내는 이력으로 보존하고, 저장으로 연장된 만료일을 응답에서 새로 확인한다.
  await call(`/listing-applications/drafts/${due.id}`, a.token, 'PATCH', {});
  check(
    (await warnings.notifyExpiringDrafts()) === 0,
    '다시 저장한 신청서는 90일 연장 후 안내 제외',
  );
  await prisma.listingApplication.update({
    where: { id: due.id },
    data: { expiresAt: new Date(now + 6 * 86400000) },
  });
  check(
    (await warnings.notifyExpiringDrafts()) === 1,
    '새 만료일이 도래하면 새 주기 경고 생성',
  );

  // 후보 스캔 이후 저장/삭제와 경합할 때 회원 잠금 뒤 최신 상태로 판정한다.
  const stale = await draft(1);
  await client.query('BEGIN');
  await client.query('SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE', [
    a.id,
  ]);
  const pending = warnings.notifyExpiringDrafts();
  let waiting = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const locks = await root.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'",
      [databaseName],
    );
    if (locks.rows[0].n > 0) {
      waiting = true;
      break;
    }
    await setTimeout(20);
  }
  check(waiting, '배치가 저장과 같은 회원 잠금을 기다림');
  await client.query(
    "UPDATE listing_applications SET expires_at=now()+interval '90 days' WHERE application_id=$1",
    [stale.id],
  );
  await client.query('COMMIT');
  check(
    (await pending) === 0,
    '스캔 뒤 저장 연장된 신청서에 오래된 경고 생성 안 함',
  );
  check(
    (await prisma.notification.count({
      where: { eventKey: { startsWith: `draft:${stale.id}:` } },
    })) === 0,
    '경합 결과 DB 확인',
  );

  await prisma.listingApplication.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.listingApplication.createMany({
    data: Array.from({ length: 103 }, (_, index) => ({
      userId: index % 2 ? a.id : b.id,
      expiresAt: new Date(Date.now() + 3 * 86400000),
    })),
  });
  check(
    (await warnings.notifyExpiringDrafts()) === 103,
    '100건을 넘는 배치 페이지 순회',
  );
  check(
    (await warnings.notifyExpiringDrafts()) === 0,
    '다음 주기에도 103건 중복 생성 안 함',
  );
  const schema = await fetch(base.replace('/api', '') + '/api/docs-json').then(
    (response) => response.json(),
  );
  check(
    [
      '/api/notifications',
      '/api/notifications/unread-count',
      '/api/notifications/{notificationId}/read',
    ].every((path) => path in schema.paths),
    'Swagger 3개 API 등록',
  );
  check(
    !schema.paths['/api/notifications'].post,
    '외부 알림 생성 API는 노출하지 않음',
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      isolatedDatabase: true,
      productionChanged: false,
    }),
  );
} finally {
  if (client) {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  if (app) await app.close();
  if (createdDatabase) await root.query(`DROP DATABASE "${databaseName}"`);
  await root.end();
}
