// npm run build 후 실행. 기존 DB 대신 localhost의 일회용 DB에 실제 seed를 실행한다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const originalUrl = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(originalUrl.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost PostgreSQL에서만 검증할 수 있습니다.',
);
const databaseName = `motu_listing_seed_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const testUrl = new URL(originalUrl);
testUrl.pathname = `/${databaseName}`;
const environment = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  NODE_ENV: 'test',
  BREVO_API_KEY: '',
  FILE_STORAGE_DRIVER: 'local',
  SEED_ADMIN_PASSWORD: 'SeedAdmin-test1!',
  SEED_USER_PASSWORD: 'SeedUser-test1!',
};
const root = new pg.Client({ connectionString: originalUrl.toString() });
const client = new pg.Client({ connectionString: testUrl.toString() });
const execute = promisify(execFile);
let createdDatabase = false;
let connectedClient = false;
let app;
let base;
let checks = 0;
const DAY = 86400000;
const check = (condition, message) => {
  assert(condition, message);
  checks++;
};
const seed = () =>
  execute(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
    {
      env: environment,
      timeout: 60000,
    },
  );
const applicationSnapshot = async () =>
  (
    await client.query(
      'SELECT row_to_json(a) AS value FROM listing_applications a ORDER BY application_id',
    )
  ).rows.map((row) => row.value);
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
  assert.equal(
    response.status,
    status,
    `${method} ${path}: expected ${status}, got ${response.status} (${result.error?.code ?? ''})`,
  );
  if (code) assert.equal(result.error?.code, code);
  checks++;
  return status < 400 ? result.data : result.error;
}

try {
  await root.connect();
  await root.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  await client.connect();
  connectedClient = true;
  await execute(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { env: environment, timeout: 60000 },
  );
  const seedStartedAt = Date.now();
  await seed();
  const seedFinishedAt = Date.now();
  Object.assign(process.env, environment);
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { setupApp } = await import('../dist/setup-app.js');
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;

  const { accessToken } = await call('/auth/login', null, 'POST', {
    loginId: 'motuuser',
    password: environment.SEED_USER_PASSWORD,
  });
  const applications = (
    await client.query(`
      SELECT a.* FROM listing_applications a
      JOIN users u ON u.user_id=a.user_id WHERE u.login_id='motuuser'
      ORDER BY a.application_id
    `)
  ).rows;
  check(applications.length === 7, 'motuuser 신청서 7건 생성');
  const task = applications.find((row) => row.service_name === 'TaskFlow');
  const meal = applications.find((row) => row.service_name === 'MealKit');
  check(
    task?.status === 'DRAFT' && meal?.status === 'DRAFT',
    '작성 중 신청서 2건 생성',
  );
  const step = (id, number) =>
    `/listing-applications/drafts/${id}/steps/${number}`;
  // 새 값을 덮어쓰지 않고 저장해야 seed의 실제 입력값이 검증된다.
  for (const draft of [task, meal]) {
    const saved = await call(
      step(draft.application_id, 2),
      accessToken,
      'PUT',
      { data: {} },
    );
    check(
      saved.validatedStep === 2 && saved.status === 'DRAFT',
      'seed 그대로 2단계 검증·저장',
    );
    check(
      saved.applicationNumber === null,
      '단계 저장은 신청번호를 발급하지 않음',
    );
  }
  const metrics = await call(step(meal.application_id, 3), accessToken, 'PUT', {
    data: {},
  });
  check(
    metrics.validatedStep === 3 &&
      metrics.data.transactionVolumeBasis === 'LAST_12_MONTHS',
    'seed 그대로 3단계 검증·저장',
  );

  for (const row of applications) {
    const date = row.draft_data.desiredListingDate;
    check(
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(date),
      `${row.service_name} 미래 ISO 일시`,
    );
    check(
      Date.parse(date) >= seedStartedAt + 30 * DAY &&
        Date.parse(date) <= seedFinishedAt + 30 * DAY,
      `${row.service_name} 실행 시점의 30일 후`,
    );
    if (row.current_step >= 3)
      check(
        row.draft_data.transactionVolumeBasis === 'LAST_12_MONTHS',
        `${row.service_name} 거래액 집계 기준`,
      );
    const detail = await call(
      `/listing-applications/${row.application_id}`,
      accessToken,
    );
    const state = await call(
      `/listing-applications/${row.application_id}/status`,
      accessToken,
    );
    check(
      detail.status === row.status && state.status === row.status,
      `${row.service_name} 상태 보존`,
    );
    check(
      detail.data.desiredListingDate === date,
      `${row.service_name} 상세 날짜 보존`,
    );
    check(
      state.applicationNumber === row.application_number,
      `${row.service_name} 기존 번호 정책 유지`,
    );
    if (row.status === 'DRAFT') {
      check(
        state.isEditable &&
          state.applicationNumber === null &&
          state.submittedAt === null,
        '임시저장과 최초 제출 구분',
      );
    } else {
      check(
        !state.isEditable &&
          state.expiresAt === null &&
          Boolean(state.submittedAt),
        '접수 이후 상태는 읽기 전용',
      );
      await call(
        step(row.application_id, 2),
        accessToken,
        'PUT',
        { data: {} },
        409,
        'LISTING_APPLICATION_NOT_DRAFT',
      );
    }
  }
  const labels = {
    SUBMITTED: '접수',
    UNDER_REVIEW: '검토 중',
    REVISION_REQUESTED: '보완 요청',
    APPROVED: '승인',
    REJECTED: '반려',
  };
  for (const [status, label] of Object.entries(labels)) {
    const row = applications.find((value) => value.status === status);
    check(Boolean(row), `${status} fixture 존재`);
    const result = await call(
      `/listing-applications/${row.application_id}/status`,
      accessToken,
    );
    check(result.statusLabel === label, `${status} 한글 상태 라벨`);
  }
  const list = await call('/listing-applications/drafts?limit=5', accessToken);
  check(
    list.totalCount === 2 && list.items.length === 2,
    '작성 중 목록은 접수 이후 신청서 제외',
  );

  // 잘못된 값을 다시 제출하면 seed의 정상 입력값과 저장 시각이 유지돼야 한다.
  const beforeInvalid = await applicationSnapshot();
  await call(
    step(task.application_id, 2),
    accessToken,
    'PUT',
    { data: { desiredListingDate: '2026-12-01' } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(
    step(meal.application_id, 3),
    accessToken,
    'PUT',
    { data: { transactionVolumeBasis: '결제 완료 금액 합계' } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  check(
    JSON.stringify(await applicationSnapshot()) ===
      JSON.stringify(beforeInvalid),
    '잘못된 이전 값 저장 실패 시 DB·시각 롤백',
  );

  const firstSnapshot = await applicationSnapshot();
  await seed();
  check(
    JSON.stringify(await applicationSnapshot()) ===
      JSON.stringify(firstSnapshot),
    'seed 재실행 시 번호·입력값·시각 유지 및 중복 없음',
  );

  // 과거 seed 또는 사용자가 수정한 입력값을 DB에 남겨도 새 seed가 자동 덮어쓰지 않는다.
  await client.query(
    `UPDATE listing_applications SET draft_data = draft_data || $2::jsonb WHERE application_id=$1`,
    [
      task.application_id,
      JSON.stringify({
        desiredPrice: '12000',
        desiredListingDate: '2026-12-01',
        transactionVolumeBasis: '결제 완료 금액 합계',
      }),
    ],
  );
  const legacySnapshot = await applicationSnapshot();
  await seed();
  check(
    JSON.stringify(await applicationSnapshot()) ===
      JSON.stringify(legacySnapshot),
    '기존 신청서와 과거 seed 값은 자동 보정하지 않음',
  );
  const legacyDetail = await call(
    `/listing-applications/${task.application_id}`,
    accessToken,
  );
  check(
    legacyDetail.data.desiredPrice === '12000' &&
      legacyDetail.data.desiredListingDate === '2026-12-01',
    '사용자 변경값·기존 날짜 조회 보존',
  );
  await call(
    step(task.application_id, 2),
    accessToken,
    'PUT',
    { data: {} },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(
    step(task.application_id, 3),
    accessToken,
    'PUT',
    { data: {} },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  check(
    JSON.stringify(await applicationSnapshot()) ===
      JSON.stringify(legacySnapshot),
    '과거 값 재검증 실패 시 기존 데이터 유지',
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      isolatedDatabase: true,
      seedRuns: 3,
      productionChanged: false,
    }),
  );
} finally {
  if (app) await app.close();
  if (connectedClient) await client.end();
  if (createdDatabase) await root.query(`DROP DATABASE "${databaseName}"`);
  await root.end();
}
