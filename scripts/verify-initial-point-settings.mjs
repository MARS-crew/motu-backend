// npm run build 후 실행. localhost 일회용 DB에서만 검증하며 실제 메일·SMS는 보내지 않는다.
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
  'motu_initial_points_' + randomUUID().replaceAll('-', '').slice(0, 12);
const root = new pg.Client({ connectionString: url.toString() });
url.pathname = '/' + database;
const tempRoot = resolve(tmpdir());
const uploads = await mkdtemp(join(tempRoot, 'motu-initial-points-'));
const apps = [];
const bases = [];
const route = '/admin/point-settings/initial-grant';
let db;
let created = false;
let checks = 0;
let releaseGate;
const check = (condition, message) => {
  assert(condition, message);
  checks++;
};
async function request(
  path,
  token,
  { method = 'GET', body, instance = 0 } = {},
) {
  const response = await fetch(bases[instance] + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, result: await response.json() };
}
async function call(path, token, options = {}) {
  const { status, result } = await request(path, token, options);
  assert.equal(
    status,
    options.status ?? 200,
    path + ' ' + JSON.stringify(result),
  );
  if (options.code) {
    assert.equal(result.error?.code, options.code);
  }
  checks++;
  return status < 400 ? result.data : result.error;
}
async function waitLock(fragment) {
  const end = Date.now() + 7000;
  while (Date.now() < end) {
    const { rows } = await root.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query ILIKE $2",
      [database, '%' + fragment + '%'],
    );
    if (rows.length) {
      checks++;
      return;
    }
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error(
    '설정 행 잠금을 기다리는 요청을 찾지 못했습니다: ' + fragment,
  );
}
const migrate = () =>
  promisify(execFile)(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { timeout: 60000 },
  );
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
  await migrate();
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { setupApp } = await import('../dist/setup-app.js');
  const { setupSwagger } = await import('../dist/config/swagger.config.js');
  const { PrismaService } =
    await import('../dist/common/prisma/prisma.service.js');
  const { PointSettingsService } =
    await import('../dist/modules/point-settings/point-settings.service.js');
  const { AdminActivityLogsService } =
    await import('../dist/modules/admin-activity-logs/admin-activity-logs.service.js');
  const { ListingActivationService } =
    await import('../dist/modules/listing-applications/listing-activation.service.js');
  const { MailSender } = await import('../dist/common/mail/mail-sender.js');
  const { SmsSender } = await import('../dist/common/sms/sms-sender.js');
  for (let i = 0; i < 2; i++) {
    const app = await NestFactory.create(AppModule, { logger: false });
    apps.push(app);
    for (const sender of [MailSender, SmsSender]) {
      app.get(sender).send = async () => {
        throw new Error('검증 중 외부 발송 금지');
      };
    }
    setupApp(app);
    setupSwagger(app);
    await app.listen(0, '127.0.0.1');
    app.get(ListingActivationService).onModuleDestroy();
    bases.push(
      'http://127.0.0.1:' + app.getHttpServer().address().port + '/api',
    );
  }
  const prisma = apps[0].get(PrismaService);
  const password = 'Points-test1!';
  const passwordHash = await hash(password);
  const member = async (loginId, role = 'USER', userStatus = 'ACTIVE') => {
    const user = await prisma.user.create({
      data: {
        loginId,
        role,
        userStatus,
        password: passwordHash,
        nickname: loginId.slice(-10),
        email: loginId + '@motu.test',
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
      },
    });
    const login = await call('/auth/login', null, {
      method: 'POST',
      body: { loginId, password },
    });
    return { id: user.id, token: login.accessToken };
  };
  const admin = await member('pointadmin', 'ADMIN');
  const admin2 = await member('pointadmin2', 'ADMIN');
  const user = await member('pointuser');
  let serial = 0;
  async function signupBody() {
    const loginId = 'newpoint' + ++serial;
    const email = loginId + '@motu.test';
    // 인증 완료 상태만 일회용 DB에 준비한다. 실제 가입·검증 소비·계좌·원장 경로는 HTTP로 실행한다.
    await prisma.verification.create({
      data: {
        channel: 'EMAIL',
        purpose: 'SIGNUP',
        target: email,
        codeHash: '0'.repeat(64),
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return {
      loginId,
      email,
      nickname: '새포인트' + serial,
      password,
      birthDate: '2000-01-01',
      termsAgreed: true,
      privacyAgreed: true,
      marketingAgreed: false,
    };
  }
  async function signup(expected, options = {}) {
    const body = await signupBody();
    const joined = await call('/users', null, {
      method: 'POST',
      status: 201,
      body,
      ...options,
    });
    check(joined.cash === expected, '가입 응답 실제 지급액');
    const account = await prisma.account.findUniqueOrThrow({
      where: { userId: joined.userId },
      include: { ledgers: true },
    });
    check(
      account.cash === BigInt(expected) &&
        account.ledgers.length === 1 &&
        account.ledgers[0].type === 'DEPOSIT' &&
        account.ledgers[0].amount === account.cash &&
        account.ledgers[0].balanceAfter === account.cash,
      '계좌·초기 지급 원장 일치',
    );
    return { joined, account };
  }
  const current = (instance = 0) => call(route, admin.token, { instance });
  const history = () => call(route + '/history', admin.token);
  const update = async (amount, options = {}) => {
    const state = await current();
    return call(route, admin.token, {
      method: 'PATCH',
      body: { amount, expectedVersion: state.version, reason: '정책 변경' },
      ...options,
    });
  };
  const initial = await current();
  check(
    initial.amount === 3_000_000 && initial.version === 1,
    'DB 최초 기본값',
  );
  check(
    (await history()).totalCount === 0,
    '기본값 준비는 관리자 변경 이력을 만들지 않음',
  );
  const old = await signup(3_000_000);
  const oldSnapshot = await prisma.account.findUniqueOrThrow({
    where: { id: old.account.id },
    include: { ledgers: true },
  });
  const spec = await (await fetch(bases[0] + '/docs-json')).json();
  check(
    spec.paths['/api' + route].get &&
      spec.paths['/api' + route].patch &&
      spec.paths['/api' + route + '/history'].get,
    'Swagger 관리자 세 API 등록',
  );
  check(
    spec.components.schemas.UpdateInitialGrantReqDto.properties.amount.type ===
      'integer' &&
      spec.paths['/api' + route + '/history'].get.parameters.find(
        (parameter) => parameter.name === 'page',
      ).schema.type === 'integer',
    'Swagger 금액·페이지 정수',
  );
  for (const path of [route, route + '/history']) {
    await call(path, null, { status: 401 });
    await call(path, user.token, { status: 403 });
  }
  await call(route, user.token, {
    method: 'PATCH',
    body: { amount: 1, expectedVersion: 1, reason: '차단' },
    status: 403,
  });
  const invalid = [
    {},
    null,
    [],
    { amount: 0 },
    ...[0, -1, 0.5, '1', null, true, Number.MAX_SAFE_INTEGER + 1].map(
      (amount) => ({ amount, expectedVersion: 1, reason: '변경' }),
    ),
    ...[0, 0.5, '1', null].map((expectedVersion) => ({
      amount: 1,
      expectedVersion,
      reason: '변경',
    })),
    ...['', ' ', '가'.repeat(201), null, 1].map((reason) => ({
      amount: 1,
      expectedVersion: 1,
      reason,
    })),
    { amount: 1, expectedVersion: 1, reason: '변경', adminId: user.id },
  ];
  for (const body of invalid) {
    await call(route, admin.token, { method: 'PATCH', body, status: 400 });
  }
  for (const query of ['page=0', 'size=101', 'page=1.5', 'size=abc']) {
    await call(route + '/history?' + query, admin.token, { status: 400 });
  }
  check(
    JSON.stringify(await current()) === JSON.stringify(initial) &&
      (await history()).totalCount === 0,
    '잘못된 요청은 설정·이력·시각 보존',
  );
  const changed = await update(5_000_000, {
    body: {
      amount: 5_000_000,
      expectedVersion: 1,
      reason: '  신규 가입 지급 변경  ',
    },
  });
  check(
    changed.version === 2 && (await current(1)).amount === 5_000_000,
    '두 서버 설정 공유',
  );
  await signup(5_000_000, { instance: 1 });
  assert.deepEqual(
    await prisma.account.findUniqueOrThrow({
      where: { id: old.account.id },
      include: { ledgers: true },
    }),
    oldSnapshot,
  );
  checks++;
  const log = (await history()).items[0];
  check(
    log.beforeAmount === 3_000_000 &&
      log.afterAmount === 5_000_000 &&
      log.beforeVersion === 1 &&
      log.afterVersion === 2 &&
      log.reason === '신규 가입 지급 변경' &&
      log.adminId === admin.id &&
      log.adminLoginId === 'pointadmin' &&
      Boolean(log.createDate),
    '변경 전후·사유·관리자·시각',
  );
  const common = await call(
    '/admin/activity-logs?targetType=POINT_SETTING&action=INITIAL_GRANT_UPDATE',
    admin.token,
  );
  check(common.totalCount === 1, '공통 관리자 활동 이력 필터와 연결');
  const same = await update(5_000_000);
  check(
    same.version === changed.version &&
      same.modifiedDate === changed.modifiedDate &&
      (await history()).totalCount === 1,
    '같은 금액 no-op',
  );
  await update(6_000_000, {
    body: { amount: 6_000_000, expectedVersion: 1, reason: '오래된 버전' },
    status: 409,
    code: 'POINT_SETTINGS_CONCURRENT_UPDATE',
  });
  const version = (await current()).version;
  const concurrent = await Promise.all([
    request(route, admin.token, {
      method: 'PATCH',
      body: {
        amount: 6_000_000,
        expectedVersion: version,
        reason: '동시 변경 A',
      },
    }),
    request(route, admin2.token, {
      method: 'PATCH',
      instance: 1,
      body: {
        amount: 7_000_000,
        expectedVersion: version,
        reason: '동시 변경 B',
      },
    }),
  ]);
  check(
    concurrent.filter((r) => r.status === 200).length === 1 &&
      concurrent.filter((r) => r.status === 409).length === 1 &&
      concurrent.find((r) => r.status === 409).result.error.code ===
        'POINT_SETTINGS_CONCURRENT_UPDATE',
    '서로 다른 서버의 동시 수정은 한 건만 성공',
  );
  check((await history()).totalCount === 2, '동시 수정 이력은 한 건');
  const beforeFailure = await current();
  const countBeforeFailure = (await history()).totalCount;
  await db.query(`CREATE FUNCTION reject_point_setting_log() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'INITIAL_GRANT_UPDATE' THEN RAISE EXCEPTION 'injected log failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_point_setting_log BEFORE INSERT ON admin_activity_logs FOR EACH ROW EXECUTE FUNCTION reject_point_setting_log();`);
  await update(8_000_000, { status: 500 });
  await db.query(
    'DROP TRIGGER reject_point_setting_log ON admin_activity_logs; DROP FUNCTION reject_point_setting_log()',
  );
  check(
    JSON.stringify(await current()) === JSON.stringify(beforeFailure) &&
      (await history()).totalCount === countBeforeFailure,
    '실제 DB 이력 저장 실패 시 금액·버전·시각 롤백',
  );
  // 가입이 먼저 설정 공유 잠금을 잡은 경우: 가입 완료까지 변경은 대기하고 이전 금액을 지급한다.
  const settings = apps[0].get(PointSettingsService);
  const originalGrant = settings.getSignupGrant.bind(settings);
  let signal;
  const entered = new Promise((done) => {
    signal = done;
  });
  const gate = new Promise((done) => {
    releaseGate = done;
  });
  settings.getSignupGrant = async (tx) => {
    const amount = await originalGrant(tx);
    signal();
    await gate;
    return amount;
  };
  const oldAmount = (await current()).amount;
  const pendingSignup = signup(oldAmount);
  await entered;
  const pendingUpdate = update(8_000_000, { instance: 1 });
  await waitLock('FOR UPDATE');
  releaseGate();
  await Promise.all([pendingSignup, pendingUpdate]);
  settings.getSignupGrant = originalGrant;
  // 변경이 먼저 설정 잠금을 잡은 경우: 가입은 변경 커밋까지 대기하고 새 금액을 지급한다.
  const activities = apps[0].get(AdminActivityLogsService);
  const originalRecord = activities.record.bind(activities);
  let enteredUpdate;
  const recorded = new Promise((done) => {
    enteredUpdate = done;
  });
  const updateGate = new Promise((done) => {
    releaseGate = done;
  });
  activities.record = async (activity, tx) => {
    if (activity.action === 'INITIAL_GRANT_UPDATE') {
      enteredUpdate();
      await updateGate;
    }
    return originalRecord(activity, tx);
  };
  const modifying = update(9_000_000);
  await recorded;
  const joining = signup(9_000_000, { instance: 1 });
  await waitLock('FOR SHARE');
  releaseGate();
  await Promise.all([modifying, joining]);
  activities.record = originalRecord;
  const failedBody = await signupBody();
  await db.query(`CREATE FUNCTION reject_initial_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.type = 'DEPOSIT' THEN RAISE EXCEPTION 'injected ledger failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_initial_ledger BEFORE INSERT ON cash_ledgers FOR EACH ROW EXECUTE FUNCTION reject_initial_ledger();`);
  await call('/users', null, { method: 'POST', body: failedBody, status: 500 });
  check(
    (await prisma.user.count({ where: { loginId: failedBody.loginId } })) === 0,
    '가입 원장 실패 시 회원·계좌 롤백',
  );
  check(
    (
      await prisma.verification.findFirst({
        where: { target: failedBody.email },
      })
    ).consumedAt === null,
    '가입 실패 시 인증 소비 롤백',
  );
  await db.query(
    'DROP TRIGGER reject_initial_ledger ON cash_ledgers; DROP FUNCTION reject_initial_ledger()',
  );
  const retry = await call('/users', null, {
    method: 'POST',
    body: failedBody,
    status: 201,
  });
  check(retry.cash === 9_000_000, '같은 인증으로 가입 재시도 가능');
  // 최소·최대 경계는 기존 회원 잔액을 바꾸지 않고 신규 가입에만 적용된다.
  await update(1);
  await signup(1);
  await update(Number.MAX_SAFE_INTEGER);
  await signup(Number.MAX_SAFE_INTEGER);
  const persisted = await current();
  await migrate();
  check(
    JSON.stringify(await current(1)) === JSON.stringify(persisted),
    '마이그레이션 재실행은 변경 설정 보존',
  );
  await apps[1].close();
  apps.pop();
  bases.pop();
  const restarted = await NestFactory.create(AppModule, { logger: false });
  apps.push(restarted);
  setupApp(restarted);
  await restarted.listen(0, '127.0.0.1');
  restarted.get(ListingActivationService).onModuleDestroy();
  bases.push(
    'http://127.0.0.1:' + restarted.getHttpServer().address().port + '/api',
  );
  check(
    JSON.stringify(await current(1)) === JSON.stringify(persisted),
    '서버 재시작 후 설정 유지',
  );
  const oldLogin = await call('/auth/login', null, {
    method: 'POST',
    body: { loginId: old.joined.loginId, password },
  });
  const resetToken = oldLogin.accessToken;
  await call('/admin/accounts/' + old.joined.userId + '/cash', admin.token, {
    method: 'PATCH',
    body: { amount: -2_800_000, reason: '리셋 회귀 검증' },
  });
  const resetState = await call('/accounts/me/point-reset', resetToken);
  check(
    resetState.resetCash === 3_000_000 && resetState.available,
    '변경 설정과 무관한 리셋 고정값·조건',
  );
  const reset = await call('/accounts/me/point-reset', resetToken, {
    method: 'POST',
  });
  check(reset.cashAfter === 3_000_000, '리셋 금액 유지');
  await call('/accounts/me/point-reset', resetToken, {
    method: 'POST',
    status: 409,
    code: 'POINT_RESET_NOT_ALLOWED',
  });
  const grant = await call('/accounts/me/point-grant', resetToken, {
    method: 'POST',
  });
  check(
    grant.amount === 100_000 && grant.cashAfter === 3_100_000,
    '추가 지급 금액 유지',
  );
  await call('/accounts/me/point-grant', resetToken, {
    method: 'POST',
    status: 409,
    code: 'POINT_GRANT_TOO_SOON',
  });
  const historyAll = await history();
  const page2 = await call(route + '/history?page=2&size=1', admin.token);
  check(
    page2.items[0].activityLogId === historyAll.items[1].activityLogId &&
      page2.totalCount === historyAll.totalCount,
    '변경 이력 최신순 페이징·개별 지급 제외',
  );
  const empty = await call(route + '/history?page=1000', admin.token);
  check(
    empty.items.length === 0 && empty.totalCount === historyAll.totalCount,
    '빈 페이지',
  );
  await prisma.user.update({
    where: { id: admin2.id },
    data: { userStatus: 'BLOCKED' },
  });
  await call(route, admin2.token, { status: 403 });
  await call(route, admin2.token, {
    method: 'PATCH',
    body: {
      amount: 1,
      expectedVersion: persisted.version,
      reason: '정지 차단',
    },
    status: 403,
  });
  for (const sql of [
    'INSERT INTO initial_point_settings (setting_id) VALUES (2)',
    'UPDATE initial_point_settings SET amount=0',
    'UPDATE initial_point_settings SET amount=9007199254740992',
    'UPDATE initial_point_settings SET version=0',
  ]) {
    await assert.rejects(db.query(sql), (error) => error.code === '23514');
    checks++;
  }
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      isolatedDatabase: true,
      twoServers: true,
      signupUpdateRaceBothOrders: true,
      productionChanged: false,
      externalMessagesSent: false,
    }),
  );
} finally {
  releaseGate?.();
  for (const app of apps.reverse()) {
    await app.close();
  }
  if (db) {
    await db.end();
  }
  if (created) {
    await root.query('DROP DATABASE "' + database + '" WITH (FORCE)');
  }
  await root.end();
  const target = resolve(uploads);
  assert(
    dirname(target) === tempRoot &&
      basename(target).startsWith('motu-initial-points-'),
  );
  await rm(target, { recursive: true, force: true });
}
