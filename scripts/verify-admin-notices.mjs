// npm run build 후 실행. 관리자·사용자 API를 일회용 로컬 DB에서 검증한다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { hash } from 'argon2';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost PostgreSQL에서만 실행할 수 있습니다.',
);
const dbName =
  'motu_admin_notices_' + randomUUID().replaceAll('-', '').slice(0, 12);
const root = new pg.Client({ connectionString: url.toString() });
url.pathname = '/' + dbName;
let createdDatabase = false;
let app;
let base;
let checks = 0;
const route = '/admin/notices';
const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const date = (days) => new Date(now + days * day).toISOString();
const bodyFor = (title, start = -1, end = 1, isImportant = true) => ({
  type: 'ALL',
  title,
  content: '점검 안내\n변경 사항 안내',
  isImportant,
  postStartDate: date(start),
  postEndDate: end === null ? null : date(end),
});

async function request(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body:
      response.status === 204 ? await response.text() : await response.json(),
  };
}
async function call(path, token, method = 'GET', body, status = 200, code) {
  const result = await request(path, token, method, body);
  assert.equal(
    result.status,
    status,
    method + ' ' + path + ' ' + JSON.stringify(result.body),
  );
  if (code) assert.equal(result.body.error?.code, code);
  if (status === 204) assert.equal(result.body, '');
  checks++;
  return result.body.data;
}

try {
  await root.connect();
  await root.query('CREATE DATABASE "' + dbName + '"');
  createdDatabase = true;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    NODE_ENV: 'test',
    FILE_STORAGE_DRIVER: 'local',
    BREVO_API_KEY: '',
    SMS_SENDER: '',
  });
  await promisify(execFile)(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { timeout: 60000 },
  );
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { PrismaService } =
    await import('../dist/common/prisma/prisma.service.js');
  const { setupApp } = await import('../dist/setup-app.js');
  const { setupSwagger } = await import('../dist/config/swagger.config.js');
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  setupSwagger(app);
  await app.listen(0, '127.0.0.1');
  base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const prisma = app.get(PrismaService);

  const password = 'Notice-Test1!';
  const passwordHash = await hash(password);
  async function login(loginId, role) {
    await prisma.user.create({
      data: {
        loginId,
        role,
        password: passwordHash,
        nickname: loginId,
        email: loginId + '@motu.test',
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
      },
    });
    return (await call('/auth/login', null, 'POST', { loginId, password }))
      .accessToken;
  }
  const admin = await login('noticeadm', 'ADMIN');
  const secondAdmin = await login('noticeadm2', 'ADMIN');
  const user = await login('noticeuser', 'USER');
  await prisma.sector.create({ data: { code: 1, name: '소프트웨어' } });
  const stock = await prisma.stock.create({
    data: {
      stockCode: 'PRD-018',
      name: 'SaaS Index',
      summary: '테스트 상품',
      sectorCode: 1,
      mainImageUrl: 'https://example.com/product.png',
      operatorName: '모투',
      listedShares: 1000n,
      basePrice: 1000n,
      priceTickSize: 10n,
      minOrderPrice: 100n,
      minOrderQty: 1n,
      listingDate: new Date(),
      tradeStatus: 'ACTIVE',
    },
  });
  const create = (body, status = 201, code) =>
    call(route, admin, 'POST', body, status, code);
  const detail = (notice) => route + '/' + notice.noticeId;
  const patch = (notice, body, status = 200, code) =>
    call(detail(notice), admin, 'PATCH', body, status, code);
  const pinError = 'NOTICE_PIN_LIMIT_EXCEEDED';

  for (const [path, method, body] of [
    [route, 'GET'],
    [route, 'POST', bodyFor('권한 검사')],
    [route + '/1', 'GET'],
    [route + '/1', 'PATCH', { title: '권한 검사' }],
    [route + '/1/hide', 'POST', { reason: '권한 검사' }],
    [route + '/1/delete', 'POST', { reason: '권한 검사' }],
    [route + '/1/publish', 'POST', {}],
  ]) {
    await call(path, null, method, body, 401);
    await call(path, user, method, body, 403, 'AUTH_FORBIDDEN');
  }
  for (const body of [
    { ...bodyFor('가'.repeat(101)) },
    { ...bodyFor('문자열 고정'), isImportant: 'true' },
    { ...bodyFor('널 고정'), isImportant: null },
    { ...bodyFor('시간대 누락'), postStartDate: '2026-11-16T12:00:00' },
    { ...bodyFor('유효하지 않은 날짜'), postStartDate: '2026-02-30T00:00:00Z' },
    { ...bodyFor('시각 범위 초과'), postStartDate: '2026-11-16T24:00:00Z' },
    { ...bodyFor('서버 필드'), isDeleted: true },
  ])
    await create(body, 400, 'BAD_REQUEST');
  await create(
    { ...bodyFor('공백 본문'), content: ' \n ' },
    400,
    'NOTICE_REQUIRED_FIELDS',
  );
  await create(
    { ...bodyFor('대상 누락'), type: 'STOCK' },
    400,
    'NOTICE_INVALID_TARGET',
  );
  await create(
    { ...bodyFor('전체 공지에 상품 지정'), stockId: stock.id },
    400,
    'NOTICE_INVALID_TARGET',
  );
  await create(
    { ...bodyFor('없는 상품'), type: 'STOCK', stockId: 2147483647 },
    404,
    'NOTICE_STOCK_NOT_FOUND',
  );
  await create(bodyFor('같은 시작과 종료', 1, 1), 400, 'NOTICE_INVALID_PERIOD');
  await create(bodyFor('끝이 앞선 기간', 2, 1), 400, 'NOTICE_INVALID_PERIOD');
  for (const query of ['?page=0', '?page=100001', '?size=51']) {
    await call(route + query, admin, 'GET', undefined, 400, 'BAD_REQUEST');
  }

  const publicNotice = await create(bodyFor('일반 공개 공지', -0.25, 1, false));
  const scheduled = await create(bodyFor('예약 공지', 10, 11));
  const ended = await create(bodyFor('종료 공지', -3, -2));
  assert.deepEqual(
    [publicNotice.status, scheduled.status, ended.status],
    ['PUBLISHED', 'SCHEDULED', 'ENDED'],
  );
  const firstPage = await call(route + '?page=1&size=2', admin);
  const secondPage = await call(route + '?page=2&size=2', admin);
  assert.equal(firstPage.totalCount, 3);
  assert.equal(secondPage.totalCount, 3);
  assert.deepEqual(
    firstPage.items.map((x) => x.noticeId),
    [scheduled.noticeId, publicNotice.noticeId],
  );
  assert.deepEqual(
    secondPage.items.map((x) => x.noticeId),
    [ended.noticeId],
  );
  assert.equal(
    (await call(detail(scheduled), admin)).content,
    '점검 안내\n변경 사항 안내',
  );
  for (const notice of [scheduled, ended]) {
    await call(
      '/notices/' + notice.noticeId,
      null,
      'GET',
      undefined,
      404,
      'NOTICE_NOT_FOUND',
    );
  }

  const pinnedA = await create(bodyFor('고정 1'));
  const pinnedB = await create({
    ...bodyFor('고정 2'),
    type: 'STOCK',
    stockId: stock.id,
  });
  assert.deepEqual(
    [pinnedB.stockId, pinnedB.stockCode, pinnedB.stockName],
    [stock.id, stock.stockCode, stock.name],
  );
  const pinnedC = await create(bodyFor('고정 3'));
  const visible = await call('/notices', null);
  assert.deepEqual(
    visible.items.map((x) => x.noticeId),
    [
      pinnedC.noticeId,
      pinnedB.noticeId,
      pinnedA.noticeId,
      publicNotice.noticeId,
    ],
  );
  assert.equal(
    (await call('/notices/latest', null)).notice.noticeId,
    publicNotice.noticeId,
  );
  await create(bodyFor('고정 4 실패'), 409, pinError);
  await patch(publicNotice, { isImportant: true }, 409, pinError);
  const filtered = await call('/notices?stockId=' + stock.id, null);
  assert.deepEqual(
    filtered.items.map((item) => item.noticeId),
    [pinnedB.noticeId],
  );
  assert.equal(filtered.items[0].stockName, stock.name);
  assert(!Object.hasOwn(filtered.items[0], 'stockId'));
  assert(!Object.hasOwn(filtered.items[0], 'stockCode'));
  assert.equal(
    (await call('/notices/' + pinnedB.noticeId, null)).stockName,
    stock.name,
  );
  await prisma.stock.update({
    where: { id: stock.id },
    data: { isPublic: false },
  });
  assert.equal(
    (await call('/notices?stockId=' + stock.id, null)).totalCount,
    0,
  );
  await call(
    '/notices/' + pinnedB.noticeId,
    null,
    'GET',
    undefined,
    404,
    'NOTICE_NOT_FOUND',
  );
  await prisma.stock.update({
    where: { id: stock.id },
    data: { isPublic: true },
  });

  const draft = await create({
    status: 'DRAFT',
    type: 'STOCK',
    isImportant: true,
  });
  assert.equal(draft.status, 'DRAFT');
  assert.equal(draft.postStartDate, null);
  assert.equal(
    (await call(route + '?status=DRAFT', admin)).items[0].noticeId,
    draft.noticeId,
  );
  assert.equal(
    (await call(route + '?status=DRAFT&from=' + date(-1), admin)).totalCount,
    0,
  );
  await call(
    detail(draft) + '/publish',
    admin,
    'POST',
    {},
    400,
    'NOTICE_REQUIRED_FIELDS',
  );
  await patch(draft, {
    ...bodyFor('상품 임시 저장'),
    type: 'STOCK',
    stockId: stock.id,
  });
  await call(
    '/notices/' + draft.noticeId,
    null,
    'GET',
    undefined,
    404,
    'NOTICE_NOT_FOUND',
  );
  await call(detail(draft) + '/publish', admin, 'POST', {}, 409, pinError);
  await call(
    detail(draft) + '/hide',
    admin,
    'POST',
    { reason: '임시 저장은 비공개 처리할 수 없음' },
    409,
    'NOTICE_INVALID_STATUS',
  );
  for (const body of [{}, { reason: ' ' }, { reason: '가'.repeat(201) }]) {
    await call(
      detail(pinnedB) + '/hide',
      admin,
      'POST',
      body,
      400,
      'BAD_REQUEST',
    );
    await call(
      detail(pinnedA) + '/delete',
      admin,
      'POST',
      body,
      400,
      'BAD_REQUEST',
    );
  }
  const hidden = await call(detail(pinnedB) + '/hide', admin, 'POST', {
    reason: '  점검으로 비공개  ',
  });
  assert.equal(hidden.status, 'HIDDEN');
  assert.equal(
    (await call(route + '?status=HIDDEN', admin)).items[0].noticeId,
    pinnedB.noticeId,
  );
  await call(
    '/notices/' + pinnedB.noticeId,
    null,
    'GET',
    undefined,
    404,
    'NOTICE_NOT_FOUND',
  );
  await patch(pinnedB, { title: '비공개 공지 수정' });
  assert.equal(
    (await call(detail(draft) + '/publish', admin, 'POST', {})).status,
    'PUBLISHED',
  );
  await call(detail(pinnedB) + '/publish', admin, 'POST', {}, 409, pinError);
  assert.equal((await call(detail(pinnedB), admin)).status, 'HIDDEN');
  await call(
    detail(draft) + '/delete',
    admin,
    'POST',
    { reason: '임시 저장 테스트 정리' },
    204,
  );
  assert.equal(
    (await call(detail(pinnedB) + '/publish', admin, 'POST', {})).status,
    'PUBLISHED',
  );
  await call(
    detail(ended) + '/publish',
    admin,
    'POST',
    {},
    400,
    'NOTICE_PUBLISH_PERIOD_ENDED',
  );
  const history = await call(
    '/admin/activity-logs?targetType=NOTICE&targetId=' + pinnedB.noticeId,
    admin,
  );
  assert.deepEqual(
    history.items.map(({ action }) => action),
    ['NOTICE_PUBLISH', 'NOTICE_UPDATE', 'NOTICE_HIDE', 'NOTICE_PUBLISH'],
  );
  const hideLog = await call(
    '/admin/activity-logs/' + history.items[2].activityLogId,
    admin,
  );
  assert.equal(hideLog.reason, '점검으로 비공개');
  assert.deepEqual(hideLog.after, { status: 'HIDDEN' });
  assert.equal((await call(detail(publicNotice), admin)).isImportant, false);
  await patch(pinnedA, { title: '  제목 수정  ' });
  await patch(pinnedA, {});
  await patch(pinnedA, { title: null }, 400, 'BAD_REQUEST');
  await patch(pinnedA, { isImportant: null }, 400, 'BAD_REQUEST');
  await patch(pinnedA, { postEndDate: date(-2) }, 400, 'NOTICE_INVALID_PERIOD');
  await call(
    detail(pinnedA) + '/delete',
    admin,
    'POST',
    { reason: '  테스트 공지 삭제  ' },
    204,
  );
  await call(
    detail(pinnedA),
    admin,
    'GET',
    undefined,
    404,
    'NOTICE_ADMIN_NOT_FOUND',
  );
  await call(
    '/notices/' + pinnedA.noticeId,
    null,
    'GET',
    undefined,
    404,
    'NOTICE_NOT_FOUND',
  );
  await call(
    detail(pinnedA) + '/delete',
    admin,
    'POST',
    { reason: '삭제 재시도' },
    404,
    'NOTICE_ADMIN_NOT_FOUND',
  );
  const deleted = await prisma.notice.findUniqueOrThrow({
    where: { id: pinnedA.noticeId },
  });
  assert(deleted.isDeleted && deleted.deletedDate);
  for (const [query, ids] of [
    [
      '?type=STOCK&stockId=' + stock.id + '&status=PUBLISHED',
      [pinnedB.noticeId],
    ],
    ['?keyword=' + pinnedB.noticeId, [pinnedB.noticeId]],
    ['?keyword=' + encodeURIComponent('공지 수정'), [pinnedB.noticeId]],
    [
      '?from=' + date(10) + '&to=' + date(11) + '&status=SCHEDULED',
      [scheduled.noticeId],
    ],
    ['?from=' + date(11) + '&to=' + date(12), []],
    ['?status=ENDED', [ended.noticeId]],
    ['?status=DELETED&keyword=' + pinnedA.noticeId, [pinnedA.noticeId]],
  ]) {
    const result = await call(route + query, admin);
    assert.deepEqual(
      result.items.map((item) => item.noticeId),
      ids,
    );
    assert.equal(result.totalCount, ids.length);
  }
  await call(
    route + '?from=' + date(2) + '&to=' + date(1),
    admin,
    'GET',
    undefined,
    400,
    'NOTICE_INVALID_PERIOD',
  );
  assert.equal(
    (await patch(publicNotice, { isImportant: true })).isImportant,
    true,
  );
  assert.equal(
    (await patch(pinnedB, { isImportant: false })).isImportant,
    false,
  );
  await create(bodyFor('고정 해제 후 새 공지'));

  // 겹치는 공지가 세 건이어도, 서로 이어지는 기간이면 동시 게시 건수는 다르다.
  await create(bodyFor('예약 구간 A', 31, 32));
  await create(bodyFor('예약 구간 B', 32, 33));
  await create(bodyFor('예약 구간 C', 33, 34));
  await create(bodyFor('예약 구간 전체', 31, 34));
  await create(bodyFor('예약 구간 B 추가', 32, 33));
  await create(bodyFor('예약 구간 B 초과', 32, 33), 409, pinError);
  await create(bodyFor('앞 공지 종료와 동일 시각 시작', 34, 35));
  const short = await create(bodyFor('짧게 예약한 공지', 29, 30));
  await patch(short, { postEndDate: null }, 409, pinError);
  assert.equal((await call(detail(short), admin)).postEndDate, date(30));
  const long = await create(bodyFor('종료 없음', 40, null));
  assert.equal(long.postEndDate, null);
  assert.equal(
    (await patch(long, { postEndDate: date(41) })).postEndDate,
    date(41),
  );
  assert.equal((await patch(long, { postEndDate: null })).postEndDate, null);

  // 서로 다른 관리자의 동시에 도착한 예약 등록과 고정 전환을 모두 DB에서 직렬화한다.
  const concurrentTarget = await create(
    bodyFor('동시 고정 전환 후보', 50, 51, false),
  );
  const overlapping = await Promise.all([
    request(detail(concurrentTarget), secondAdmin, 'PATCH', {
      isImportant: true,
    }),
    ...Array.from({ length: 7 }, (_, i) =>
      request(
        route,
        i % 2 ? secondAdmin : admin,
        'POST',
        bodyFor('동시 등록 ' + i, 50, 51),
      ),
    ),
  ]);
  assert.equal(
    overlapping.filter((x) => x.status === 200 || x.status === 201).length,
    2,
  );
  assert.equal(
    overlapping.filter(
      (x) => x.status === 409 && x.body.error.code === pinError,
    ).length,
    6,
  );
  assert.equal(
    await prisma.notice.count({
      where: {
        isDeleted: false,
        isImportant: true,
        postStartDate: new Date(date(50)),
      },
    }),
    2,
  );
  checks += overlapping.length;

  const logs = await call(
    '/admin/activity-logs?targetType=NOTICE&targetId=' + pinnedA.noticeId,
    admin,
  );
  assert.deepEqual(
    logs.items.map((x) => x.action),
    ['NOTICE_DELETE', 'NOTICE_UPDATE', 'NOTICE_PUBLISH'],
  );
  const editLog = await call(
    '/admin/activity-logs/' + logs.items[1].activityLogId,
    admin,
  );
  assert.deepEqual(editLog.before, { title: '고정 1' });
  assert.deepEqual(editLog.after, { title: '제목 수정' });
  assert.equal(
    (await call('/admin/activity-logs/' + logs.items[0].activityLogId, admin))
      .reason,
    '테스트 공지 삭제',
  );

  // 실제 DB에서 이력 INSERT를 실패시켜 공지 저장도 롤백되는지 확인한다.
  await prisma.$executeRawUnsafe(
    "CREATE FUNCTION reject_notice_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_label = '롤백 검사' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$",
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER reject_notice_audit BEFORE INSERT ON admin_activity_logs FOR EACH ROW EXECUTE FUNCTION reject_notice_audit()',
  );
  await create(bodyFor('롤백 검사', -1, 1, false), 500);
  assert.equal(await prisma.notice.count({ where: { title: '롤백 검사' } }), 0);
  assert.equal(
    await prisma.adminActivityLog.count({
      where: { targetLabel: '롤백 검사' },
    }),
    0,
  );

  const swagger = (await (await fetch(base + '/docs-json')).json()).paths;
  const listOperation = swagger['/api' + route]?.get;
  assert(listOperation?.security);
  for (const name of ['page', 'size']) {
    const parameter = listOperation.parameters.find(
      (item) => item.name === name,
    );
    assert.equal(parameter?.in, 'query');
    assert.equal(parameter.schema.type, 'number');
  }
  assert(swagger['/api' + route]?.post?.security);
  const path = swagger['/api' + route + '/{noticeId}'];
  assert(path?.get?.security && path?.patch?.security);
  for (const action of ['hide', 'delete', 'publish']) {
    assert(swagger['/api' + route + '/{noticeId}/' + action]?.post?.security);
  }
  console.log(
    JSON.stringify({
      result: 'PASS',
      httpChecks: checks,
      isolatedDatabase: true,
    }),
  );
} finally {
  try {
    await app?.close();
  } finally {
    try {
      if (createdDatabase) await root.query('DROP DATABASE "' + dbName + '"');
    } finally {
      await root.end();
    }
  }
}
