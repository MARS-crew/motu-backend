// npm run build 후 실행. localhost의 전용 테스트 계정만 사용하며 모든 테스트 데이터를 정리한다.
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
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const base = 'http://127.0.0.1:3091/api';
const draftRoute = '/listing-applications/drafts';
const route = '/listing-applications';
const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
const users = [];
let server;
let checks = 0;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
async function request(path, token, method = 'GET', body, status = 200, code) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  if (code) assert.equal(result.error?.code, code, JSON.stringify(result));
  checks++;
  return result;
}
async function call(...args) {
  return (await request(...args)).data;
}
try {
  await client.connect();
  for (let i = 0; i < 2; i++) {
    const loginId = `step${suffix}${i}`;
    const result = await client.query(
      `INSERT INTO users(login_id,password,email,nickname,birth_date,terms_agreed,privacy_agreed,marketing_agreed,modified_date) SELECT $1,password,$2,$3,birth_date,true,true,false,now() FROM users WHERE login_id='motuuser' RETURNING user_id`,
      [loginId, `${loginId}@motu.test`, `S${suffix}${i}`],
    );
    assert.equal(result.rowCount, 1, '로컬 seed motuuser 계정이 필요합니다.');
    users.push({ id: result.rows[0].user_id, loginId });
  }
  server = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env,
      PORT: '3091',
      FILE_STORAGE_DRIVER: 'local',
      BREVO_API_KEY: '',
    },
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(200);
  }
  assert(ready, '테스트 서버 시작 실패');
  for (const user of users)
    user.token = (
      await call('/auth/login', null, 'POST', {
        loginId: user.loginId,
        password: 'motuuser1!',
      })
    ).accessToken;
  const [a, b] = users;
  const draft = await call(draftRoute, a.token, 'POST', {}, 201);
  const id = draft.id;
  const path = `${route}/${id}`;
  const stepPath = `${draftRoute}/${id}/steps`;
  await call(path, null, 'GET', undefined, 401);
  await call(path + '/status', null, 'GET', undefined, 401);
  for (const otherPath of [path, path + '/status'])
    await call(
      otherPath,
      b.token,
      'GET',
      undefined,
      404,
      'LISTING_APPLICATION_NOT_FOUND',
    );
  await call(
    stepPath + '/1',
    b.token,
    'PUT',
    { data: {} },
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  await call(
    route + '/not-number',
    a.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  await call(
    stepPath + '/5',
    a.token,
    'PUT',
    { data: {} },
    400,
    'LISTING_INVALID_STEP',
  );
  await call(stepPath + '/1', a.token, 'PUT', {}, 400, 'BAD_REQUEST');
  await call(stepPath + '/1', a.token, 'PUT', { data: [] }, 400, 'BAD_REQUEST');
  await call(
    stepPath + '/1',
    a.token,
    'PUT',
    { data: { status: 'SUBMITTED' } },
    400,
    'BAD_REQUEST',
  );
  await call(
    stepPath + '/1',
    a.token,
    'PUT',
    { data: { desiredPrice: '10000' } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  const initial = await call(path, a.token);
  assert.equal(initial.status, 'DRAFT');
  assert.equal(initial.applicationNumber, null);
  assert.equal(initial.submittedAt, null);
  const missing = await request(
    stepPath + '/1',
    a.token,
    'PUT',
    { data: {} },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  assert(
    missing.error.details.fields.some(
      (issue) => issue.field === 'mainImageCollectionId',
    ),
  );
  assert.deepEqual((await call(path, a.token)).data, {});
  assert.equal((await call(path, a.token)).lastSavedAt, initial.lastSavedAt);
  const category = (await call('/sectors', a.token)).items[0].sectorCode;
  const main = await call(
    '/files/collections',
    a.token,
    'POST',
    { purpose: 'MAIN_IMAGE' },
    201,
  );
  const form = new FormData();
  form.append('files', new Blob([png], { type: 'image/png' }), 'main.png');
  const [image] = await call(
    `/files/collections/${main.id}/uploads`,
    a.token,
    'POST',
    form,
    201,
  );
  const basic = {
    serviceName: '단계 저장 테스트',
    summary: '상장 신청 단계별 저장 검증용 서비스입니다.',
    sectorCode: category,
    mainImageCollectionId: main.id,
    operatorName: '테스트 운영사',
    managerName: '테스트 담당자',
    businessEmail: 'owner@example.com',
    contactPhone: '010-1234-5678',
    officialUrl: `https://s${suffix}.example.test`,
  };
  await call(
    stepPath + '/1',
    a.token,
    'PUT',
    { data: basic },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(`/files/collections/${main.id}`, a.token, 'PUT', {
    attachmentIds: [image.id],
  });
  const foreign = await call(
    '/files/collections',
    b.token,
    'POST',
    { purpose: 'MAIN_IMAGE' },
    201,
  );
  await call(
    stepPath + '/1',
    a.token,
    'PUT',
    { data: { ...basic, mainImageCollectionId: foreign.id } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(
    stepPath + '/1',
    a.token,
    'PUT',
    { data: { ...basic, sectorCode: 999999 } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  const savedBasic = await call(stepPath + '/1', a.token, 'PUT', {
    data: basic,
  });
  assert.equal(savedBasic.validatedStep, 1);
  assert.equal(savedBasic.status, 'DRAFT');
  const trading = {
    desiredPrice: '10000',
    totalIssuedQuantity: '100000',
    minOrderQuantity: '5',
    tickSize: '10',
    priceCalculationBasis: '매출과 이용자 수에 근거한 희망 상장가입니다.',
    desiredListingDate: new Date(Date.now() + 2 * 86400000).toISOString(),
  };
  await call(
    stepPath + '/2',
    a.token,
    'PUT',
    { data: { ...trading, desiredPrice: '-1' } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(stepPath + '/2', a.token, 'PUT', { data: trading });
  const before = await call(path, a.token);
  await call(
    stepPath + '/2',
    a.token,
    'PUT',
    { data: { desiredListingDate: '2027-02-30T09:00:00+09:00' } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  assert.equal((await call(path, a.token)).lastSavedAt, before.lastSavedAt);
  assert.equal(
    (await call(path, a.token)).data.desiredListingDate,
    trading.desiredListingDate,
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
  const year = Number(today.slice(0, 4));
  const metrics = {
    mau: '0',
    mauSource: '사용자 분석',
    mauReferenceMonth: today.slice(0, 7),
    dau: '0',
    dauSource: '사용자 분석',
    dauReferenceDate: today,
    revenue: '0',
    revenueStartDate: `${year - 1}-01-01`,
    revenueEndDate: `${year - 1}-12-31`,
    revenueSource: '회계 보고서',
    revenueExtractDate: `${year}-01-01`,
    transactionVolume: '0',
    transactionVolumeBasis: 'LAST_12_MONTHS',
    metricsStartDate: `${year - 1}-01-01`,
    metricsEndDate: `${year - 1}-12-31`,
    transactionVolumeSource: '결제 내역',
    transactionVolumeExtractDate: `${year}-01-01`,
  };
  // 3단계는 기본값·개별 항목만 보내도 다른 입력을 필수로 바꾸지 않는다.
  const emptyMetrics = Object.fromEntries(
    Object.keys(metrics).map((field) => [field, null]),
  );
  const emptyStep = await call(stepPath + '/3', a.token, 'PUT', { data: {} });
  assert.equal(emptyStep.validatedStep, 3);
  for (const [field, value] of Object.entries(metrics)) {
    const saved = await call(stepPath + '/3', a.token, 'PUT', {
      data: { ...emptyMetrics, [field]: value },
    });
    assert.equal(saved.validatedStep, 3);
    assert.equal(saved.data[field], value);
    assert.equal(saved.data.desiredPrice, trading.desiredPrice);
  }
  await call(stepPath + '/3', a.token, 'PUT', {
    data: { ...emptyMetrics, transactionVolumeBasis: 'LAST_12_MONTHS' },
  });
  const mergedDefault = await call(stepPath + '/3', a.token, 'PUT', {
    data: {},
  });
  assert.equal(mergedDefault.data.transactionVolumeBasis, 'LAST_12_MONTHS');
  assert.equal(mergedDefault.data.transactionVolume, null);
  await call(stepPath + '/3', a.token, 'PUT', {
    data: { mau: '123', dau: '0', revenue: '0', transactionVolume: '0' },
  });
  const cleared = await call(stepPath + '/3', a.token, 'PUT', {
    data: Object.fromEntries(Object.keys(metrics).map((field) => [field, ''])),
  });
  assert(Object.keys(metrics).every((field) => cleared.data[field] === null));
  for (const invalid of [
    { mau: '-1' },
    { dau: '1.5' },
    { revenue: '1,000' },
    { transactionVolume: 'NaN' },
    { mauReferenceMonth: `${year}-13` },
    { dauReferenceDate: `${year}-02-30` },
    { transactionVolumeBasis: 'UNKNOWN' },
    {
      revenueStartDate: `${year}-01-02`,
      revenueEndDate: `${year}-01-01`,
    },
    {
      metricsStartDate: `${year - 1}-01-01`,
      metricsEndDate: `${year}-01-01`,
    },
    {
      revenueEndDate: `${year}-01-02`,
      revenueExtractDate: `${year}-01-01`,
    },
  ]) {
    const snapshot = await call(path, a.token);
    await call(
      stepPath + '/3',
      a.token,
      'PUT',
      { data: { ...emptyMetrics, ...invalid } },
      400,
      'LISTING_STEP_VALIDATION_FAILED',
    );
    const unchanged = await call(path, a.token);
    assert.deepEqual(unchanged.data, snapshot.data);
    assert.equal(unchanged.lastSavedAt, snapshot.lastSavedAt);
    assert.equal(unchanged.currentStep, snapshot.currentStep);
  }
  await call(
    stepPath + '/3',
    a.token,
    'PUT',
    { data: { mau: 0 } },
    400,
    'BAD_REQUEST',
  );
  await call(
    stepPath + '/3',
    a.token,
    'PUT',
    { data: { ...metrics, metricsStartDate: `${year - 2}-01-01` } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(
    stepPath + '/3',
    a.token,
    'PUT',
    { data: { ...metrics, revenueExtractDate: `${year - 2}-01-01` } },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  await call(stepPath + '/3', a.token, 'PUT', { data: metrics });
  const evidence = await call(
    '/files/collections',
    a.token,
    'POST',
    { purpose: 'EVIDENCE' },
    201,
  );
  const link = await call(
    `/files/collections/${evidence.id}/links`,
    a.token,
    'POST',
    { url: 'https://example.com/proof' },
    201,
  );
  await call(
    `/files/collections/${evidence.id}/links`,
    a.token,
    'POST',
    { url: 'https://example.com/not-selected' },
    201,
  );
  await call(`/files/collections/${evidence.id}`, a.token, 'PUT', {
    attachmentIds: [link.id],
    description: '검증용으로 저장한 증빙 자료입니다.',
  });
  await call(
    stepPath + '/4',
    a.token,
    'PUT',
    {
      data: { evidenceCollectionId: evidence.id, evidenceDescription: '짧음' },
    },
    400,
    'LISTING_STEP_VALIDATION_FAILED',
  );
  const step4 = await call(stepPath + '/4', a.token, 'PUT', {
    data: {
      evidenceCollectionId: evidence.id,
      evidenceDescription: '서비스 지표를 확인할 수 있는 증빙 자료입니다.',
    },
  });
  assert.equal(step4.validatedStep, 4);
  assert.equal(step4.applicationNumber, null);
  const detail = await call(path, a.token);
  assert.equal(detail.data.desiredPrice, '10000');
  assert.equal(detail.data.mau, '0');
  assert.equal(detail.attachments.mainImage.attachments[0].id, image.id);
  assert.equal(detail.attachments.evidence.attachments.length, 1);
  assert.equal(detail.attachments.evidence.attachments[0].id, link.id);
  // 다른 단계 동시 저장이 서로의 변경을 덮어쓰지 않아야 한다.
  await Promise.all([
    call(stepPath + '/1', a.token, 'PUT', {
      data: { summary: '동시 요청에서도 유지되는 서비스 소개입니다.' },
    }),
    call(stepPath + '/2', a.token, 'PUT', { data: { desiredPrice: '20000' } }),
  ]);
  const concurrent = await call(path, a.token);
  assert.equal(concurrent.data.desiredPrice, '20000');
  assert.equal(
    concurrent.data.summary,
    '동시 요청에서도 유지되는 서비스 소개입니다.',
  );
  const state = await call(path + '/status', a.token);
  assert.equal(state.status, 'DRAFT');
  assert.equal(state.isEditable, true);
  assert.equal(state.submittedAt, null);
  assert(!Object.hasOwn(state, 'data'));
  await call(path + '/submit', a.token, 'POST', {}, 404);
  assert.equal((await call(path + '/status', a.token)).status, 'DRAFT');
  // 접수 이후 상태는 테스트 전용 SQL fixture로만 준비한다. 제출/심사 API를 만들거나 호출하지 않는다.
  const submittedAt = new Date().toISOString();
  const deadline = new Date(Date.now() + 86400000).toISOString();
  const labels = {
    SUBMITTED: '접수',
    UNDER_REVIEW: '검토 중',
    REVISION_REQUESTED: '보완 요청',
    APPROVED: '승인',
    REJECTED: '반려',
  };
  for (const [status, label] of Object.entries(labels)) {
    await client.query(
      "UPDATE listing_applications SET status=$1,application_number=$2,submitted_at=$3,review_comment=$4,revision_deadline=$5,expires_at=now()-interval '1 day' WHERE application_id=$6",
      [
        status,
        `TEST-${suffix}`,
        submittedAt,
        '테스트 fixture 의견',
        deadline,
        id,
      ],
    );
    const result = await call(path, a.token);
    assert.equal(result.status, status);
    assert.equal(result.statusLabel, label);
    assert.equal(result.submittedAt, submittedAt);
    assert.equal(result.reviewComment, '테스트 fixture 의견');
    assert.equal(result.revisionDeadline, deadline);
    assert.equal(result.expiresAt, null);
    assert.equal(result.isEditable, false);
    assert.equal((await call(path + '/status', a.token)).status, status);
    await call(
      stepPath + '/2',
      a.token,
      'PUT',
      { data: trading },
      409,
      'LISTING_APPLICATION_NOT_DRAFT',
    );
    assert.equal(
      (
        await client.query(
          'SELECT status FROM listing_applications WHERE application_id=$1',
          [id],
        )
      ).rows[0].status,
      status,
    );
  }
  const expired = await call(draftRoute, a.token, 'POST', {}, 201);
  await client.query(
    'UPDATE listing_applications SET expires_at=now() WHERE application_id=$1',
    [expired.id],
  );
  await call(
    `${route}/${expired.id}`,
    a.token,
    'GET',
    undefined,
    410,
    'LISTING_DRAFT_EXPIRED',
  );
  assert.equal(
    (await call(`${route}/${expired.id}/status`, a.token)).status,
    'EXPIRED',
  );
  const deleted = await call(draftRoute, a.token, 'POST', {}, 201);
  await call(`${draftRoute}/${deleted.id}`, a.token, 'DELETE');
  await call(
    `${route}/${deleted.id}`,
    a.token,
    'GET',
    undefined,
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  await call(
    `${route}/${deleted.id}/status`,
    a.token,
    'GET',
    undefined,
    404,
    'LISTING_APPLICATION_NOT_FOUND',
  );
  // 기존 임시저장은 계속 미완성 값을 허용한다.
  const partial = await call(
    draftRoute,
    a.token,
    'POST',
    { data: { serviceName: '가', businessEmail: '입력 중' } },
    201,
  );
  assert.equal(partial.data.businessEmail, '입력 중');
  await client.query("UPDATE users SET user_status='LOCKED' WHERE user_id=$1", [
    b.id,
  ]);
  await call(
    `${route}/${partial.id}/status`,
    b.token,
    'GET',
    undefined,
    403,
    'AUTH_ACCOUNT_LOCKED',
  );
  console.log(
    `Listing steps/queries HTTP/DB integration: ${checks} checks passed (four steps, rollback, saved attachments, ownership, read-only statuses).`,
  );
} finally {
  try {
    for (const user of users) {
      // API로 파일을 지워 로컬 저장소도 정리한다. DB 삭제는 전용 계정의 데이터만 대상으로 한다.
      await client.query(
        "UPDATE users SET user_status='ACTIVE' WHERE user_id=$1",
        [user.id],
      );
      const collections = await client.query(
        'SELECT id FROM attachment_collections WHERE user_id=$1',
        [user.id],
      );
      for (const collection of collections.rows) {
        if (!user.token || !server) continue;
        const response = await call(
          `/files/collections/${collection.id}`,
          user.token,
        );
        for (const attachment of response.attachments)
          await call(
            `/files/collections/${collection.id}/attachments/${attachment.id}`,
            user.token,
            'DELETE',
          );
      }
      await client.query('DELETE FROM listing_applications WHERE user_id=$1', [
        user.id,
      ]);
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
