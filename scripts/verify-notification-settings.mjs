// npm run build 후 실행. localhost의 일회용 DB만 사용하며 외부 푸시·문자·메일은 보내지 않는다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { hash } from 'argon2';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost DB만 허용합니다.',
);
const database =
  'motu_notify_settings_' + randomUUID().replaceAll('-', '').slice(0, 12);
const root = new pg.Client({ connectionString: url.toString() });
url.pathname = '/' + database;
const tempRoot = resolve(tmpdir());
const uploads = await mkdtemp(join(tempRoot, 'motu-notify-settings-'));
const apps = [];
const bases = [];
let created = false;
let checks = 0;
const route = '/users/me/notification-settings';
async function json(
  path,
  token,
  { method = 'GET', body, status = 200, code, instance = 0 } = {},
) {
  const response = await fetch(bases[instance] + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, path + ' ' + JSON.stringify(result));
  if (code) assert.equal(result.error?.code, code);
  checks++;
  return status < 400 ? result.data : result.error;
}
const patch = (user, body, options = {}) =>
  json(route, user.token, { method: 'PATCH', body, ...options });
async function waitForUserLock() {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const result = await root.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%SELECT user_id FROM users%'",
      [database],
    );
    if (result.rows.length) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error('설정 변경 요청이 회원 잠금을 기다리지 않았습니다.');
}
try {
  await root.connect();
  await root.query('CREATE DATABASE "' + database + '"');
  created = true;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    NODE_ENV: 'test',
    BREVO_API_KEY: '',
    SMS_SENDER: '',
    FILE_STORAGE_DRIVER: 'local',
    FILE_LOCAL_DIRECTORY: uploads,
  });
  await promisify(execFile)(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { timeout: 60000 },
  );
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { setupApp } = await import('../dist/setup-app.js');
  const { setupSwagger } = await import('../dist/config/swagger.config.js');
  const { PrismaService } =
    await import('../dist/common/prisma/prisma.service.js');
  const { NotificationSettingsService } =
    await import('../dist/modules/notifications/notification-settings.service.js');
  const { NotificationsService } =
    await import('../dist/modules/notifications/notifications.service.js');
  const { ListingActivationService } =
    await import('../dist/modules/listing-applications/listing-activation.service.js');
  const { SmsSender } = await import('../dist/common/sms/sms-sender.js');
  const { MailSender } = await import('../dist/common/mail/mail-sender.js');
  for (let i = 0; i < 2; i++) {
    const app = await NestFactory.create(AppModule, { logger: false });
    apps.push(app);
    app.get(SmsSender).send = async () => {
      throw new Error('설정 검증에서 SMS를 발송할 수 없습니다.');
    };
    app.get(MailSender).send = async () => {
      throw new Error('설정 검증에서 메일을 발송할 수 없습니다.');
    };
    setupApp(app);
    setupSwagger(app);
    await app.listen(0, '127.0.0.1');
    app.get(ListingActivationService).onModuleDestroy();
    bases.push(
      'http://127.0.0.1:' + app.getHttpServer().address().port + '/api',
    );
  }
  const prisma = apps[0].get(PrismaService);
  const service = apps[0].get(NotificationSettingsService);
  const service2 = apps[1].get(NotificationSettingsService);
  const producer = apps[0].get(NotificationsService);
  const password = 'Settings-test1!';
  const passwordHash = await hash(password);
  async function member(loginId, preferences = {}) {
    const user = await prisma.user.create({
      data: {
        loginId,
        password: passwordHash,
        nickname: loginId,
        email: loginId + '@motu.test',
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        ...preferences,
      },
    });
    const login = await json('/auth/login', null, {
      method: 'POST',
      body: { loginId, password },
    });
    return { id: user.id, token: login.accessToken };
  }
  const owner = await member('notifowner');
  const other = await member('notifother', {
    isPushEnabled: false,
    nightPushEnabled: false,
  });
  const defaults = await json(route, owner.token);
  assert.deepEqual(defaults, {
    isPushEnabled: true,
    nightPushEnabled: true,
    canChangeNightPush: true,
    timeZone: 'Asia/Seoul',
    nightStart: '21:00',
    nightEnd: '08:00',
  });
  checks++;
  const spec = await (await fetch(bases[0] + '/docs-json')).json();
  assert(spec.paths['/api' + route].get);
  assert(spec.paths['/api' + route].patch);
  assert.equal(
    spec.components.schemas.UpdateNotificationSettingsReqDto.properties
      .isPushEnabled.type,
    'boolean',
  );
  checks++;
  await json(route, null, { status: 401 });
  await json(route, null, {
    method: 'PATCH',
    body: { isPushEnabled: false },
    status: 401,
  });
  await json(route, 'bad-token', { status: 401 });
  for (const body of [
    {},
    { isPushEnabled: null },
    { nightPushEnabled: null },
    { isPushEnabled: 'false' },
    { nightPushEnabled: 1 },
    { isPushEnabled: [] },
    { isPushEnabled: {} },
    { userId: other.id, isPushEnabled: true },
    { isPushEnabled: true, role: 'ADMIN' },
    { nightStart: '00:00' },
    null,
    [],
  ]) {
    await patch(owner, body, { status: 400 });
  }
  assert.deepEqual(await json(route, owner.token), defaults);
  checks++;
  assert.deepEqual(
    await json(route + '?userId=' + other.id, owner.token),
    defaults,
  );
  checks++;
  await json(`/users/${other.id}/notification-settings`, owner.token, {
    method: 'PATCH',
    body: { isPushEnabled: true },
    status: 404,
  });
  const off = await patch(owner, { isPushEnabled: false });
  assert.equal(off.nightPushEnabled, true);
  assert.equal(off.canChangeNightPush, false);
  checks++;
  for (const body of [
    { nightPushEnabled: false },
    { nightPushEnabled: true },
    { isPushEnabled: false, nightPushEnabled: false },
  ]) {
    await patch(owner, body, {
      status: 409,
      code: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH',
    });
    assert.deepEqual(await json(route, owner.token), off);
    checks++;
  }
  assert.equal(
    (await patch(owner, { isPushEnabled: true })).nightPushEnabled,
    true,
  );
  checks++;
  assert.equal(
    (await patch(owner, { nightPushEnabled: false })).isPushEnabled,
    true,
  );
  checks++;
  await patch(owner, { isPushEnabled: false });
  assert.equal(
    (await patch(owner, { isPushEnabled: true })).nightPushEnabled,
    false,
  );
  checks++;
  await patch(owner, { isPushEnabled: false });
  const both = await patch(owner, {
    isPushEnabled: true,
    nightPushEnabled: true,
  });
  assert.equal(both.nightPushEnabled, true);
  assert.equal(both.isPushEnabled, true);
  checks++;
  await patch(
    owner,
    { isPushEnabled: false, nightPushEnabled: false },
    { status: 409, code: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH' },
  );
  assert.deepEqual(await json(route, owner.token), both);
  checks++;
  assert.equal((await json(route, other.token)).isPushEnabled, false);
  checks++;
  // 별도 서버에서도 최신 값이 즉시 보이며 동일 요청 반복도 안정적이다.
  await patch(owner, { nightPushEnabled: false });
  assert.equal(
    (await json(route, owner.token, { instance: 1 })).nightPushEnabled,
    false,
  );
  checks++;
  await patch(owner, { nightPushEnabled: false }, { instance: 1 });
  const at = (time) => new Date(time);
  const day = at('2026-11-25T11:59:59.999Z');
  const night = at('2026-11-25T12:00:00Z');
  assert.deepEqual(await service.getPushDecision(owner.id, day), {
    allowed: true,
    reason: 'ALLOWED',
  });
  checks++;
  assert.deepEqual(await service2.getPushDecision(owner.id, night), {
    allowed: false,
    reason: 'NIGHT_PUSH_DISABLED',
  });
  checks++;
  await patch(owner, { isPushEnabled: false });
  assert.deepEqual(await service.getPushDecision(owner.id, day), {
    allowed: false,
    reason: 'PUSH_DISABLED',
  });
  checks++;
  assert.deepEqual(await service.getPushDecision(owner.id, night), {
    allowed: false,
    reason: 'PUSH_DISABLED',
  });
  checks++;
  assert.deepEqual(await service.getPushDecision(2147483647, day), {
    allowed: false,
    reason: 'USER_UNAVAILABLE',
  });
  checks++;
  // 전체 푸시 OFF여도 앱 내 알림 생성·조회·읽음 처리는 유지된다.
  await prisma.sector.create({ data: { code: 1, name: '테스트' } });
  const stock = await prisma.stock.create({
    data: {
      stockCode: 'TEST001',
      sectorCode: 1,
      name: '설정테스트',
      summary: '알림 회귀 테스트',
      operatorName: '모투',
      mainImageUrl: '/test/notification-settings.png',
      listedShares: 1000n,
      basePrice: 1000n,
      priceTickSize: 1n,
      minOrderPrice: 1n,
      minOrderQty: 1n,
      listingDate: new Date(),
      tradeStatus: 'ACTIVE',
    },
  });
  await prisma.account.create({ data: { userId: owner.id, cash: 100000n } });
  await prisma.account.create({ data: { userId: other.id, cash: 100000n } });
  await producer.createOrderFilled({
    userId: owner.id,
    tradeId: '1',
    orderId: '1',
    stockId: stock.id,
    stockName: stock.name,
    side: 'BUY',
    quantity: '1',
    price: '1000',
    occurredAt: new Date(),
  });
  await producer.createTargetPriceReached({
    userId: owner.id,
    alertId: '1',
    revision: randomUUID(),
    stockId: stock.id,
    stockName: stock.name,
    targetPrice: '1100',
    reachedPrice: '1100',
    occurredAt: new Date(),
  });
  const before = await json('/notifications', owner.token);
  assert.equal(before.totalCount, 2);
  checks++;
  assert.equal(
    (await json('/notifications/unread-count', owner.token)).unreadCount,
    2,
  );
  checks++;
  const read = await json(
    `/notifications/${before.items[0].id}/read`,
    owner.token,
    { method: 'PATCH' },
  );
  await patch(owner, { isPushEnabled: true });
  await patch(owner, { isPushEnabled: false });
  assert.equal((await json('/notifications', owner.token)).totalCount, 2);
  checks++;
  assert.equal(
    (await json('/notifications/unread-count', owner.token)).unreadCount,
    1,
  );
  checks++;
  const readAgain = await json(
    `/notifications/${before.items[0].id}/read`,
    owner.token,
    { method: 'PATCH' },
  );
  assert.equal(readAgain.readAt, read.readAt);
  checks++;
  await json(`/notifications/${before.items[0].id}/read`, other.token, {
    method: 'PATCH',
    status: 404,
    code: 'NOTIFICATION_NOT_FOUND',
  });
  // 잠금 획득 후 다른 인스턴스가 갱신한 최신 설정을 검증한다.
  const blocker = new pg.Client({ connectionString: url.toString() });
  await blocker.connect();
  try {
    await patch(owner, { isPushEnabled: true });
    await blocker.query('BEGIN');
    await blocker.query(
      'UPDATE users SET is_push_enabled=false WHERE user_id=$1',
      [owner.id],
    );
    const waiting = patch(
      owner,
      { nightPushEnabled: true },
      {
        status: 409,
        code: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH',
        instance: 1,
      },
    );
    await waitForUserLock();
    await blocker.query('COMMIT');
    await waiting;
    assert.equal((await json(route, owner.token)).isPushEnabled, false);
    checks++;
    await blocker.query('BEGIN');
    await blocker.query(
      "UPDATE users SET user_status='BLOCKED' WHERE user_id=$1",
      [owner.id],
    );
    const statusRace = patch(
      owner,
      { isPushEnabled: true },
      { status: 403, code: 'AUTH_ACCOUNT_BLOCKED' },
    );
    await waitForUserLock();
    await blocker.query('COMMIT');
    await statusRace;
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .isPushEnabled,
      false,
    );
    checks++;
  } finally {
    await blocker.query('ROLLBACK');
    await blocker.end();
  }
  await json(route, owner.token, { status: 403, code: 'AUTH_ACCOUNT_BLOCKED' });
  assert.deepEqual(await service.getPushDecision(owner.id, day), {
    allowed: false,
    reason: 'USER_UNAVAILABLE',
  });
  checks++;
  await prisma.user.update({
    where: { id: owner.id },
    data: { userStatus: 'LOCKED' },
  });
  await patch(
    owner,
    { isPushEnabled: true },
    { status: 403, code: 'AUTH_ACCOUNT_LOCKED' },
  );
  await prisma.user.update({
    where: { id: owner.id },
    data: { userStatus: 'WITHDRAWN', isDeleted: true },
  });
  await json(route, owner.token, { status: 401 });
  assert.deepEqual(await service.getPushDecision(owner.id, day), {
    allowed: false,
    reason: 'USER_UNAVAILABLE',
  });
  checks++;
  // 조회는 기존의 네 가지 저장 조합을 바꾸지 않는다.
  for (const isPushEnabled of [false, true])
    for (const nightPushEnabled of [false, true]) {
      await prisma.user.update({
        where: { id: other.id },
        data: { isPushEnabled, nightPushEnabled },
      });
      const value = await json(route, other.token);
      assert.equal(value.isPushEnabled, isPushEnabled);
      assert.equal(value.nightPushEnabled, nightPushEnabled);
      assert.equal(value.canChangeNightPush, isPushEnabled);
      checks++;
    }
  console.log(
    JSON.stringify({
      ok: true,
      checks,
      instances: 2,
      database: 'disposable-local-only',
      realPushSent: false,
      scenarios: [
        'own-settings-and-strict-input',
        'stored-night-consent-preserved',
        'atomic-parent-child-update',
        'kst-boundaries-and-current-delivery-policy',
        'in-app-notification-create-list-read-count-regression',
        'concurrent-disable-and-night-update',
        'account-status-race',
        'legacy-preference-combinations-preserved',
      ],
    }),
  );
} finally {
  try {
    await Promise.all(apps.map((app) => app.close()));
  } finally {
    try {
      if (created) await root.query('DROP DATABASE "' + database + '"');
    } finally {
      await root.end();
      assert.equal(dirname(uploads), tempRoot);
      assert(basename(uploads).startsWith('motu-notify-settings-'));
      await rm(uploads, { recursive: true, force: true });
    }
  }
}
