// npm run build 후 실행. 전용 테스트 계정과 로컬 DB만 사용하고 finally에서 정리한다.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';

assert(
  ['localhost', '127.0.0.1'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ),
  '로컬 DB만 허용합니다.',
);
const base = 'http://127.0.0.1:3090/api';
const route = '/listing-applications/drafts';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const users = [];
const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
let server;
let checks = 0;
async function raw(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function call(path, token, method = 'GET', body, status = 200, code) {
  const result = await raw(path, token, method, body);
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code)
    assert.equal(result.body.error?.code, code, JSON.stringify(result.body));
  checks++;
  return result.body.data;
}
async function clear(userId) {
  await client.query('DELETE FROM listing_applications WHERE user_id=$1', [
    userId,
  ]);
}

try {
  await client.connect();
  for (let index = 0; index < 2; index++) {
    const loginId = `draft${suffix}${index}`;
    const result = await client.query(
      `INSERT INTO users (login_id,password,email,nickname,birth_date,terms_agreed,privacy_agreed,marketing_agreed,modified_date)
      SELECT $1,password,$2,$3,birth_date,true,true,false,now() FROM users WHERE login_id='motuuser' RETURNING user_id`,
      [loginId, `${loginId}@motu.test`, `T${suffix}${index}`],
    );
    assert.equal(result.rowCount, 1, '로컬 seed 계정 motuuser가 필요합니다.');
    users.push({ id: result.rows[0].user_id, loginId });
  }
  server = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env,
      PORT: '3090',
      FILE_STORAGE_DRIVER: 'local',
      BREVO_API_KEY: '',
    },
    stdio: 'ignore',
  });
  let ready = false;
  for (let index = 0; index < 100; index++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(200);
  }
  assert(ready, '테스트 서버 시작 실패');
  for (const user of users) {
    const result = await call('/auth/login', null, 'POST', {
      loginId: user.loginId,
      password: 'motuuser1!',
    });
    user.token = result.accessToken;
  }
  const [a, b] = users;
  await call(route, null, 'GET', undefined, 401);
  const draft = await call(route, a.token, 'POST', {}, 201);
  assert.equal(draft.applicationNumber, null);
  assert.deepEqual(draft.data, {});
  assert.equal(
    Date.parse(draft.expiresAt) - Date.parse(draft.lastSavedAt),
    90 * 86400000,
  );
  await call(
    route + `/${draft.id}`,
    b.token,
    'GET',
    undefined,
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  await call(
    route + `/${draft.id}`,
    b.token,
    'PATCH',
    {},
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  await call(
    route + `/${draft.id}`,
    b.token,
    'DELETE',
    undefined,
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  const saved = await call(route + `/${draft.id}`, a.token, 'PATCH', {
    currentStep: 2,
    data: {
      serviceName: '테스트',
      summary: '미완성',
      businessEmail: '입력 중',
      desiredPrice: '',
    },
  });
  assert.equal(saved.currentStep, 2);
  assert.equal(saved.data.businessEmail, '입력 중');
  const patched = await call(route + `/${draft.id}`, a.token, 'PATCH', {
    data: { summary: null },
  });
  assert.equal(patched.data.serviceName, '테스트');
  assert.equal(patched.data.summary, null);
  const invalid = await raw(route, a.token, 'POST', { currentStep: 5 });
  assert.equal(invalid.status, 400);
  assert(
    invalid.body.error.details.every((message) =>
      message.includes('요청 값이 올바르지 않습니다.'),
    ),
  );
  checks++;
  for (const body of [
    { status: 'APPROVED' },
    { userId: b.id },
    { data: { applicationNumber: 'fake' } },
  ])
    await call(route, a.token, 'POST', body, 400, 'BAD_REQUEST');
  await call(
    route + '/not-number',
    a.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  await call(route + '?limit=6', a.token, 'GET', undefined, 400, 'BAD_REQUEST');
  await call(
    route,
    a.token,
    'POST',
    { data: { officialUrl: 'http://example.com' } },
    400,
    'LISTING_INVALID_URL',
  );
  await clear(a.id);

  // 같은 계정 동시 생성 12회 중 정확히 5회만 성공해야 한다.
  const parallel = await Promise.all(
    Array.from({ length: 12 }, () => raw(route, a.token, 'POST', {})),
  );
  assert.equal(parallel.filter((result) => result.status === 201).length, 5);
  assert(
    parallel
      .filter((result) => result.status !== 201)
      .every(
        (result) =>
          result.status === 409 &&
          result.body.error.code === 'LISTING_DRAFT_LIMIT_EXCEEDED',
      ),
  );
  checks++;
  const list = await call(route, a.token);
  assert.equal(list.totalCount, 5);
  assert.equal(list.canCreate, false);
  assert.equal(list.items.length, 5);
  const preview = await call(route + '?limit=2', a.token);
  assert.equal(preview.items.length, 2);
  assert.equal(preview.totalCount, 5);
  const oldest = list.items.at(-1);
  await call(route + `/${oldest.id}`, a.token, 'PATCH', { currentStep: 4 });
  assert.equal((await call(route, a.token)).items[0].id, oldest.id);
  await call(route + `/${oldest.id}`, a.token, 'DELETE');
  await call(
    route + `/${oldest.id}`,
    a.token,
    'GET',
    undefined,
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  await call(route, a.token, 'POST', {}, 201);
  // 한도를 채운 상태에서도 만료 건은 즉시 제외한다.
  const full = await call(route, a.token);
  await client.query(
    'UPDATE listing_applications SET expires_at=now() WHERE application_id=$1',
    [full.items[0].id],
  );
  await call(route, a.token, 'POST', {}, 201);
  assert.equal((await call(route, a.token)).totalCount, 5);
  // 접수 이후 건은 임시저장 한도에서 제외한다.
  await client.query(
    "UPDATE listing_applications SET status='SUBMITTED' WHERE user_id=$1 AND deleted_date IS NULL",
    [a.id],
  );
  await call(route, a.token, 'POST', {}, 201);
  assert.equal((await call(route, a.token)).totalCount, 1);
  await clear(a.id);

  const host = `d${suffix}.example.test`;
  // 서로 다른 계정·표기여도 DB UNIQUE가 한 건만 허용한다.
  const duplicate = await Promise.all([
    raw(route, a.token, 'POST', {
      data: { officialUrl: `https://${host.toUpperCase()}:443/app/#a` },
    }),
    raw(route, b.token, 'POST', {
      data: { officialUrl: `https://${host}/app` },
    }),
  ]);
  assert.equal(duplicate.filter((result) => result.status === 201).length, 1);
  assert.equal(
    duplicate.filter(
      (result) =>
        result.status === 409 &&
        result.body.error.code === 'LISTING_URL_IN_PROGRESS',
    ).length,
    1,
  );
  checks++;
  const winner = duplicate[0].status === 201 ? a : b;
  const loser = winner === a ? b : a;
  const active = duplicate.find((result) => result.status === 201).body.data;
  await call(route + `/${active.id}`, winner.token, 'PATCH', {
    data: { officialUrl: `https://${host}/app/` },
  });
  const other = await call(
    route,
    loser.token,
    'POST',
    { data: { officialUrl: `https://${host}/other` } },
    201,
  );
  await call(
    route + `/${other.id}`,
    loser.token,
    'PATCH',
    { data: { officialUrl: `https://${host}/app` } },
    409,
    'LISTING_URL_IN_PROGRESS',
  );
  assert.equal(
    (await call(route + `/${other.id}`, loser.token)).data.officialUrl,
    `https://${host}/other`,
  );
  await call(route + `/${active.id}`, winner.token, 'DELETE');
  const reused = await call(
    route,
    loser.token,
    'POST',
    { data: { officialUrl: `https://${host}/app` } },
    201,
  );

  // 접수/검토/보완 중 URL은 90일이 지나도 점유한다. 승인/반려는 해제한다.
  for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED']) {
    await client.query(
      "UPDATE listing_applications SET status=$1, expires_at=now()-interval '1 day' WHERE application_id=$2",
      [status, reused.id],
    );
    await call(
      route,
      winner.token,
      'POST',
      { data: { officialUrl: `https://${host}/app` } },
      409,
      'LISTING_URL_IN_PROGRESS',
    );
  }
  await call(
    route + `/${reused.id}`,
    loser.token,
    'PATCH',
    {},
    409,
    'LISTING_APPLICATION_NOT_DRAFT',
  );
  await call(
    route + `/${reused.id}`,
    loser.token,
    'DELETE',
    undefined,
    409,
    'LISTING_APPLICATION_NOT_DRAFT',
  );
  for (const status of ['APPROVED', 'REJECTED']) {
    await client.query(
      'UPDATE listing_applications SET status=$1 WHERE application_id=$2',
      [status, reused.id],
    );
    const next = await call(
      route,
      winner.token,
      'POST',
      { data: { officialUrl: `https://${host}/app` } },
      201,
    );
    await call(route + `/${next.id}`, winner.token, 'DELETE');
  }
  await clear(a.id);
  await clear(b.id);

  const expired = await call(
    route,
    a.token,
    'POST',
    { data: { officialUrl: `https://${host}/expired` } },
    201,
  );
  await client.query(
    "UPDATE listing_applications SET last_saved_at=now()-interval '90 days', expires_at=now() WHERE application_id=$1",
    [expired.id],
  );
  await call(
    route + `/${expired.id}`,
    a.token,
    'GET',
    undefined,
    410,
    'LISTING_DRAFT_EXPIRED',
  );
  await call(
    route + `/${expired.id}`,
    a.token,
    'PATCH',
    {},
    410,
    'LISTING_DRAFT_EXPIRED',
  );
  // 요청자 외 다른 계정의 만료 URL도 즉시 재사용 가능해야 한다.
  await call(
    route,
    b.token,
    'POST',
    { data: { officialUrl: `https://${host}/expired` } },
    201,
  );
  assert.equal(
    (
      await client.query(
        'SELECT status FROM listing_applications WHERE application_id=$1',
        [expired.id],
      )
    ).rows[0].status,
    'EXPIRED',
  );
  assert.equal((await call(route, a.token)).totalCount, 0);
  const warning = await call(route, a.token, 'POST', {}, 201);
  await client.query(
    "UPDATE listing_applications SET last_saved_at=now()-interval '84 days', expires_at=now()+interval '6 days' WHERE application_id=$1",
    [warning.id],
  );
  const warningDetail = await call(route + `/${warning.id}`, a.token);
  assert.equal(warningDetail.expiresSoon, true);
  const refreshed = await call(route + `/${warning.id}`, a.token, 'PATCH', {});
  assert.equal(refreshed.expiresSoon, false);
  assert.equal(
    Date.parse(refreshed.expiresAt) - Date.parse(refreshed.lastSavedAt),
    90 * 86400000,
  );
  const collection = await call(
    '/files/collections',
    a.token,
    'POST',
    { purpose: 'EVIDENCE' },
    201,
  );
  await call(route + `/${warning.id}`, a.token, 'PATCH', {
    data: { evidenceCollectionId: collection.id },
  });
  await call(
    route,
    b.token,
    'POST',
    { data: { evidenceCollectionId: collection.id } },
    404,
    'FILE_NOT_FOUND',
  );
  await call(
    route,
    a.token,
    'POST',
    { data: { logoCollectionId: collection.id } },
    400,
    'LISTING_INVALID_ATTACHMENT',
  );
  console.log(
    `Listing drafts HTTP/DB integration: ${checks} checks passed (5-draft concurrency, cross-user URL concurrency, 90-day expiry).`,
  );
} finally {
  try {
    for (const user of users) {
      await clear(user.id);
      await client.query(
        'DELETE FROM attachment_collections WHERE user_id=$1',
        [user.id],
      );
      await client.query('DELETE FROM users WHERE user_id=$1', [user.id]);
    }
  } finally {
    await client.end();
    server?.kill();
  }
}
