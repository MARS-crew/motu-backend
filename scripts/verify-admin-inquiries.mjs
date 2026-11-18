// npm run build 후 실행. 일회용 localhost DB에서 실제 HTTP·DB를 검증하며 외부 메일은 발송하지 않는다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import pg from 'pg';
import { hash } from 'argon2';

const original = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(original.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost DB만 허용합니다.',
);
const name =
  'motu_admin_inquiry_' + randomUUID().replaceAll('-', '').slice(0, 12);
const url = new URL(original);
url.pathname = '/' + name;
const root = new pg.Client({ connectionString: original.toString() });
let app,
  peer,
  base,
  peerBase,
  created = false,
  checks = 0;
let sends = 0;
const deliveries = [];
let provider = async () => ({ mode: 'BREVO', messageId: '<test@brevo.test>' });
const fakeSend = async (mail) => {
  sends++;
  deliveries.push(mail);
  return provider(mail);
};
async function request(path, token, method = 'GET', body, origin = base) {
  return fetch(origin + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json(
  path,
  token,
  { method = 'GET', body, status = 200, code, origin = base } = {},
) {
  const r = await request(path, token, method, body, origin);
  const value = await r.json();
  assert.equal(
    r.status,
    status,
    method + ' ' + path + ' ' + JSON.stringify(value),
  );
  if (code) assert.equal(value.error?.code, code);
  checks++;
  return status < 400 ? value.data : value.error;
}
const route = '/admin/inquiries';
try {
  await root.connect();
  await root.query('CREATE DATABASE "' + name + '"');
  created = true;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    NODE_ENV: 'test',
    BREVO_API_KEY: '',
    SMS_SENDER: '',
    FILE_STORAGE_DRIVER: 'local',
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
  const { MailSender, TrackedMailError } =
    await import('../dist/common/mail/mail-sender.js');
  const { AdminActivityLogsService } =
    await import('../dist/modules/admin-activity-logs/admin-activity-logs.service.js');
  const makeApp = async () => {
    const a = await NestFactory.create(AppModule, { logger: false });
    setupApp(a);
    setupSwagger(a);
    a.get(MailSender).sendTracked = fakeSend;
    await a.listen(0, '127.0.0.1');
    return a;
  };
  app = await makeApp();
  peer = await makeApp();
  base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  peerBase = 'http://127.0.0.1:' + peer.getHttpServer().address().port + '/api';
  const prisma = app.get(PrismaService);
  const password = 'Inquiry-test1!',
    passwordHash = await hash(password);
  const createUser = async (loginId, role = 'USER', userStatus = 'ACTIVE') =>
    prisma.user.create({
      data: {
        loginId,
        password: passwordHash,
        email: loginId + '@motu.test',
        nickname: loginId,
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        role,
        userStatus,
        loginFailCount: userStatus === 'LOCKED' ? 5 : 0,
      },
    });
  const admin = await createUser('inqadmin', 'ADMIN'),
    otherAdmin = await createUser('inqadmin2', 'ADMIN'),
    normal = await createUser('inqnormal'),
    locked = await createUser('inqlocked', 'USER', 'LOCKED'),
    blocked = await createUser('inqblocked', 'USER', 'BLOCKED');
  const login = async (user) =>
    (
      await json('/auth/login', null, {
        method: 'POST',
        body: { loginId: user.loginId, password },
      })
    ).accessToken;
  const at = await login(admin),
    bt = await login(otherAdmin),
    ut = await login(normal);
  const it = (
    await json('/inquiries/access-token', null, {
      method: 'POST',
      body: { loginId: locked.loginId, password },
    })
  ).inquiryAccessToken;
  const originalState = await prisma.user.findUnique({
    where: { id: locked.id },
    select: { userStatus: true, loginFailCount: true, lastLoginDate: true },
  });
  const submitted = await json('/inquiries', it, {
    method: 'POST',
    status: 201,
    body: { title: '계정 잠금 문의', content: '잠금 해제 절차를 알려주세요.' },
  });
  assert.equal(
    (await prisma.inquiry.findUnique({ where: { id: submitted.id } }))
      .replyEmail,
    locked.email,
  );
  let seq = 0;
  const prefix = 'INQ-ADMIN-' + randomUUID().slice(0, 8);
  const create = async (extra = {}) =>
    prisma.inquiry.create({
      data: {
        userId: locked.id,
        inquiryCode: prefix + '-' + ++seq,
        inquiryType: 'LOGIN_FAILED_LOCKED',
        title: '관리자 문의 테스트',
        content: '본인 확인 절차를 안내해 주세요.',
        replyEmail: locked.email,
        ...extra,
      },
    });
  const legacy = await create({ replyEmail: null });
  const migration = await readFile(
    'prisma/migrations/20261118110000_add_admin_inquiry_replies/migration.sql',
    'utf8',
  );
  const backfill = migration
    .split(';')
    .find((s) => s.trim().startsWith('UPDATE'));
  await prisma.$executeRawUnsafe(backfill);
  assert.equal(
    (await prisma.inquiry.findUnique({ where: { id: legacy.id } })).replyEmail,
    locked.email,
  );
  const fresh = await create(),
    phone = await create({ inquiryType: 'PHONE_UNAVAILABLE' }),
    suspended = await create({
      inquiryType: 'SUSPENDED',
      userId: blocked.id,
      replyEmail: blocked.email,
    });
  const statuses = await create({ status: 'APPROVED' });
  for (const [suffix, method, body] of [
    ['', 'GET'],
    ['/' + fresh.id, 'GET'],
    ['/' + fresh.id + '/start-processing', 'POST'],
    [
      '/' + fresh.id + '/reply-draft',
      'PATCH',
      { expectedVersion: 0, replyText: '답변입니다.' },
    ],
    [
      '/' + fresh.id + '/send-reply',
      'POST',
      { requestId: randomUUID(), expectedDraftVersion: 1 },
    ],
  ]) {
    for (const [token, status] of [
      [null, 401],
      [ut, 403],
      [it, 401],
    ])
      await json(route + suffix, token, { method, body, status });
  }
  const listing = await json(
    route + '?keyword=' + prefix + '&page=1&size=2',
    at,
  );
  assert.equal(listing.totalCount, 5);
  assert.equal(listing.items.length, 2);
  assert(listing.items[0].id > listing.items[1].id);
  const second = await json(
    route + '?keyword=' + prefix + '&page=2&size=2',
    at,
  );
  assert(
    second.items.every(
      (item) => !listing.items.some((prev) => prev.id === item.id),
    ),
  );
  const filter = await json(
    route +
      '?keyword=' +
      prefix +
      '&status=SUBMITTED&inquiryType=PHONE_UNAVAILABLE',
    at,
  );
  assert.equal(filter.totalCount, 1);
  assert.equal(filter.items[0].id, phone.id);
  const literal = await create({ inquiryCode: 'INQ-%-LITERAL' });
  assert.equal((await json(route + '?keyword=%25', at)).totalCount, 1);
  assert.equal(
    (await json(route + '?keyword=%25', at)).items[0].id,
    literal.id,
  );
  assert.equal((await json(route + '?keyword=_', at)).totalCount, 0);
  for (const query of [
    '?page=0',
    '?size=101',
    '?status=SENT',
    '?inquiryType=OTHER',
  ])
    await json(route + query, at, { status: 400 });
  for (const path of ['/0', '/2147483648'])
    await json(route + path, at, { status: 404 });
  await json(route + '/abc', at, { status: 400 });
  await json(route + '/2147483647', at, { status: 404 });
  const view = await json(route + '/' + fresh.id, at);
  assert.equal(view.status, 'SUBMITTED');
  assert.equal(view.assignedAdmin, null);
  assert.equal(view.canEdit, false);
  assert.equal(
    (await prisma.inquiry.findUnique({ where: { id: fresh.id } })).status,
    'SUBMITTED',
  );
  const post = (id, action, body, options = {}) =>
    json(`${route}/${id}/${action}`, at, { method: 'POST', body, ...options });
  const patch = (id, expectedVersion, replyText, options = {}) =>
    json(`${route}/${id}/reply-draft`, at, {
      method: 'PATCH',
      body: { expectedVersion, replyText },
      ...options,
    });
  // 조회 전용 관리자도 읽을 수 있지만 담당자 지정 경쟁은 한 명만 성공한다.
  const race = await create();
  const claims = await Promise.all([
    request(`${route}/${race.id}/start-processing`, at, 'POST'),
    request(
      `${route}/${race.id}/start-processing`,
      bt,
      'POST',
      undefined,
      peerBase,
    ),
  ]);
  assert.deepEqual(claims.map((r) => r.status).sort(), [200, 409]);
  checks += 2;
  const claimed = await prisma.inquiry.findUnique({ where: { id: race.id } });
  assert.equal(
    await prisma.adminActivityLog.count({
      where: {
        targetType: 'INQUIRY',
        targetId: BigInt(race.id),
        action: 'INQUIRY_START',
      },
    }),
    1,
  );
  const ownerToken = claimed.assignedAdminId === admin.id ? at : bt,
    readToken = ownerToken === at ? bt : at;
  const startTime = claimed.processingStartedAt.toISOString();
  const repeated = await json(
    `${route}/${race.id}/start-processing`,
    ownerToken,
    { method: 'POST' },
  );
  assert.equal(repeated.processingStartedAt, startTime);
  assert.equal((await json(route + '/' + race.id, readToken)).canEdit, false);
  await json(`${route}/${race.id}/reply-draft`, readToken, {
    method: 'PATCH',
    body: { expectedVersion: 0, replyText: '담당자 외 수정' },
    status: 403,
    code: 'INQUIRY_ADMIN_ASSIGNEE_ONLY',
  });
  await json(`${route}/${race.id}/send-reply`, readToken, {
    method: 'POST',
    body: { requestId: randomUUID(), expectedDraftVersion: 1 },
    status: 403,
  });
  await post(statuses.id, 'start-processing', undefined, { status: 409 });
  const unassignedLegacy = await create({ status: 'IN_PROGRESS' });
  const recovered = await post(unassignedLegacy.id, 'start-processing');
  assert.equal(recovered.assignedAdminId, admin.id);
  assert.equal(recovered.status, 'IN_PROGRESS');

  await post(fresh.id, 'start-processing');
  const d = await patch(fresh.id, 0, '  첫 줄\n둘째 줄  ');
  assert.equal(d.replyDraft, '첫 줄\n둘째 줄');
  assert.equal(d.replyVersion, 1);
  assert.equal((await patch(fresh.id, 0, '첫 줄\n둘째 줄')).replyVersion, 1);
  await patch(fresh.id, 0, '다른 초안', { status: 409 });
  const drafts = await Promise.all([
    request(`${route}/${fresh.id}/reply-draft`, at, 'PATCH', {
      expectedVersion: 1,
      replyText: '동시 초안 A',
    }),
    request(
      `${route}/${fresh.id}/reply-draft`,
      at,
      'PATCH',
      { expectedVersion: 1, replyText: '동시 초안 B' },
      peerBase,
    ),
  ]);
  assert.deepEqual(drafts.map((r) => r.status).sort(), [200, 409]);
  checks += 2;
  const v2 = await json(route + '/' + fresh.id, at);
  assert.equal(v2.replyVersion, 2);
  await post(
    fresh.id,
    'send-reply',
    { requestId: randomUUID(), expectedDraftVersion: 1 },
    { status: 409, code: 'INQUIRY_REPLY_VERSION_CONFLICT' },
  );
  await json(`${route}/${fresh.id}/send-reply`, at, {
    method: 'POST',
    body: {
      requestId: randomUUID(),
      expectedDraftVersion: 2,
      toEmail: 'redirect@example.com',
    },
    status: 400,
  });
  // 네트워크를 기다리는 동안 문의 행 잠금을 보유하지 않고, 같은 키/다른 키 모두 중복 발송을 막는다.
  let release, notify;
  const started = new Promise((resolve) => (notify = resolve));
  const gate = new Promise((resolve) => (release = resolve));
  provider = async () => {
    await prisma.$transaction(
      (tx) =>
        tx.$queryRaw`SELECT inquiry_id FROM inquiries WHERE inquiry_id=${fresh.id} FOR UPDATE NOWAIT`,
    );
    notify();
    await gate;
    return { mode: 'BREVO', messageId: '<concurrent@brevo.test>' };
  };
  const key = randomUUID(),
    sendBody = { requestId: key, expectedDraftVersion: 2 },
    beforeSends = sends;
  const sending = request(
    `${route}/${fresh.id}/send-reply`,
    at,
    'POST',
    sendBody,
  );
  await Promise.race([
    started,
    sending.then(() => {
      throw new Error('발송 전에 요청이 종료되었습니다.');
    }),
  ]);
  try {
    await post(fresh.id, 'send-reply', sendBody, {
      status: 409,
      code: 'INQUIRY_REPLY_SENDING',
      origin: peerBase,
    });
    await post(
      fresh.id,
      'send-reply',
      { ...sendBody, requestId: randomUUID() },
      { status: 409 },
    );
    await patch(fresh.id, 2, '발송 중 변경', { status: 409 });
    assert.equal((await json(route + '/' + fresh.id, at)).canEdit, false);
    assert.equal(sends, beforeSends + 1);
  } finally {
    release();
  }
  const sent = await sending;
  assert.equal(sent.status, 200);
  checks++;
  const sentValue = (await sent.json()).data;
  assert.equal(sentValue.status, 'APPROVED');
  assert(sentValue.completedAt);
  assert.equal(sentValue.simulated, false);
  assert.equal(sentValue.attempt.providerMessageId, '<concurrent@brevo.test>');
  const again = await post(fresh.id, 'send-reply', sendBody);
  assert.equal(again.completedAt, sentValue.completedAt);
  assert.equal(sends, beforeSends + 1);
  await post(
    fresh.id,
    'send-reply',
    { ...sendBody, requestId: randomUUID() },
    { status: 409 },
  );
  await post(
    fresh.id,
    'send-reply',
    { ...sendBody, expectedDraftVersion: 1 },
    { status: 409, code: 'INQUIRY_REPLY_REQUEST_CONFLICT' },
  );
  await patch(fresh.id, 2, '완료 후 수정', { status: 409 });
  assert.equal(
    await prisma.inquiryReplyAttempt.count({ where: { inquiryId: fresh.id } }),
    1,
  );
  // 공급자 확정 실패 후 초안·상태 유지, 같은 키는 결과만 재생한다.
  const failed = await create();
  await post(failed.id, 'start-processing');
  await patch(failed.id, 0, '발송 실패 시 보존할 답변');
  provider = async () => {
    throw new TrackedMailError('FAILED');
  };
  const failureKey = { requestId: randomUUID(), expectedDraftVersion: 1 },
    failureBefore = sends;
  await post(failed.id, 'send-reply', failureKey, {
    status: 503,
    code: 'INQUIRY_REPLY_SEND_FAILED',
  });
  await post(failed.id, 'send-reply', failureKey, { status: 503 });
  assert.equal(sends, failureBefore + 1);
  const failureDetail = await json(route + '/' + failed.id, at);
  assert.equal(failureDetail.status, 'IN_PROGRESS');
  assert.equal(failureDetail.replyVersion, 1);
  assert.equal(failureDetail.canEdit, true);
  assert.equal(failureDetail.replyDraft, '발송 실패 시 보존할 답변');
  assert.equal(failureDetail.latestReplyAttempt.status, 'FAILED');
  await patch(failed.id, 1, '수정한 답변');
  await post(
    failed.id,
    'send-reply',
    { ...failureKey, expectedDraftVersion: 2 },
    { status: 409 },
  );
  // 콘솔 모의 발송은 실제 발송 완료로 표시하지 않는다.
  provider = async () => ({ mode: 'CONSOLE', messageId: null });
  const simulated = await post(failed.id, 'send-reply', {
    requestId: randomUUID(),
    expectedDraftVersion: 2,
  });
  assert.equal(simulated.status, 'IN_PROGRESS');
  assert.equal(simulated.completedAt, null);
  assert.equal(simulated.simulated, true);
  assert.equal(simulated.attempt.status, 'SIMULATED');
  // 타임아웃은 상태·초안 보존. 자동 재발송 없이 명시적 동의·새 키로만 다시 보낸다.
  const uncertain = await create();
  await post(uncertain.id, 'start-processing');
  await patch(uncertain.id, 0, '불명확 발송 시 보존할 답변');
  provider = async () => {
    throw new TrackedMailError('UNKNOWN');
  };
  const unknownKey = { requestId: randomUUID(), expectedDraftVersion: 1 },
    unknownBefore = sends;
  await post(uncertain.id, 'send-reply', unknownKey, {
    status: 503,
    code: 'INQUIRY_REPLY_DELIVERY_UNKNOWN',
  });
  await post(uncertain.id, 'send-reply', unknownKey, { status: 503 });
  assert.equal(sends, unknownBefore + 1);
  await post(
    uncertain.id,
    'send-reply',
    { ...unknownKey, requestId: randomUUID() },
    { status: 409, code: 'INQUIRY_REPLY_RETRY_CONFIRMATION_REQUIRED' },
  );
  await post(
    uncertain.id,
    'send-reply',
    { ...unknownKey, requestId: randomUUID(), confirmResend: true },
    { status: 400 },
  );
  await patch(uncertain.id, 1, '불명확 상태 수정', { status: 503 });
  const ud = await json(route + '/' + uncertain.id, at);
  assert.equal(ud.canEdit, false);
  assert.equal(ud.latestReplyAttempt.status, 'UNKNOWN');
  provider = async () => ({
    mode: 'BREVO',
    messageId: '<confirmed-retry@brevo.test>',
  });
  const confirmed = await post(uncertain.id, 'send-reply', {
    requestId: randomUUID(),
    expectedDraftVersion: 1,
    confirmResend: true,
    retryReason: '공급자 발송 이력 확인 후 재발송 동의',
  });
  assert.equal(confirmed.status, 'APPROVED');
  assert.equal(
    (await json(route + '/' + uncertain.id, at)).replyAttempts.totalCount,
    2,
  );
  // 프로세스 중단으로 남은 오래된 SENDING은 조회 시 UNKNOWN이며 자동 재발송하지 않는다.
  const stale = await create();
  await post(stale.id, 'start-processing');
  await patch(stale.id, 0, '중단된 요청 답변');
  const staleAttempt = await prisma.inquiryReplyAttempt.create({
    data: {
      inquiryId: stale.id,
      requestId: randomUUID(),
      adminId: admin.id,
      draftVersion: 1,
      toEmail: locked.email,
      replyText: '중단된 요청 답변',
      createDate: new Date(Date.now() - 180000),
    },
  });
  await prisma.inquiry.update({
    where: { id: stale.id },
    data: { activeReplyAttemptId: staleAttempt.id },
  });
  assert.equal(
    (await json(route + '/' + stale.id, at)).latestReplyAttempt.status,
    'UNKNOWN',
  );
  assert.equal(
    (
      await prisma.inquiryReplyAttempt.findUnique({
        where: { id: staleAttempt.id },
      })
    ).status,
    'SENDING',
  );
  await post(
    stale.id,
    'send-reply',
    { requestId: staleAttempt.requestId, expectedDraftVersion: 1 },
    { status: 503 },
  );
  await post(
    stale.id,
    'send-reply',
    { requestId: randomUUID(), expectedDraftVersion: 1 },
    { status: 409 },
  );
  await post(stale.id, 'send-reply', {
    requestId: randomUUID(),
    expectedDraftVersion: 1,
    confirmResend: true,
    retryReason: '중단된 요청의 외부 이력 확인 후 재시도',
  });
  assert.equal(
    (
      await prisma.inquiryReplyAttempt.findUnique({
        where: { id: staleAttempt.id },
      })
    ).status,
    'UNKNOWN',
  );
  // 메일 발송 접수 후 활동 이력만 실패하면 공급자 결과를 보존하고 동일 키로 완료 반영만 재시도한다.
  const audit = await create();
  await post(audit.id, 'start-processing');
  await patch(audit.id, 0, '완료 반영 재시도 답변');
  const logs = app.get(AdminActivityLogsService),
    originalRecord = logs.record.bind(logs);
  let failComplete = true;
  logs.record = async (activity, tx) => {
    if (failComplete && activity.after?.outcome === 'ACCEPTED')
      throw new Error('completion audit failure');
    return originalRecord(activity, tx);
  };
  const auditKey = { requestId: randomUUID(), expectedDraftVersion: 1 },
    auditBefore = sends;
  try {
    await post(audit.id, 'send-reply', auditKey, { status: 500 });
  } finally {
    failComplete = false;
    logs.record = originalRecord;
  }
  assert.equal(sends, auditBefore + 1);
  const waiting = await json(route + '/' + audit.id, at);
  assert.equal(waiting.status, 'IN_PROGRESS');
  assert.equal(waiting.latestReplyAttempt.status, 'ACCEPTED');
  assert.equal(waiting.latestReplyAttempt.finalizedAt, null);
  await post(
    audit.id,
    'send-reply',
    { ...auditKey, requestId: randomUUID() },
    { status: 409 },
  );
  const finalized = await post(audit.id, 'send-reply', auditKey);
  assert.equal(finalized.status, 'APPROVED');
  assert.equal(sends, auditBefore + 1);
  await post(audit.id, 'send-reply', auditKey);
  assert.equal(sends, auditBefore + 1);
  assert.equal(
    await prisma.adminActivityLog.count({
      where: {
        targetId: BigInt(audit.id),
        targetType: 'INQUIRY',
        action: 'INQUIRY_REPLY_SEND',
        summary: '문의 이메일 답변 발송 접수 및 완료',
      },
    }),
    1,
  );
  // 공급자는 접수했지만 결과 DB 저장이 실패한 경우에도 같은 키로 메일을 재발송하지 않는다.
  const receiptFail = await create();
  await post(receiptFail.id, 'start-processing');
  await patch(receiptFail.id, 0, '공급자 접수 후 DB 장애 확인 답변');
  const updateReceipt = prisma.inquiryReplyAttempt.update.bind(
    prisma.inquiryReplyAttempt,
  );
  prisma.inquiryReplyAttempt.update = async (args) => {
    if (args.data.status === 'ACCEPTED')
      throw new Error('receipt database failure');
    return updateReceipt(args);
  };
  const receiptKey = { requestId: randomUUID(), expectedDraftVersion: 1 };
  const receiptBefore = sends;
  try {
    await post(receiptFail.id, 'send-reply', receiptKey, { status: 500 });
  } finally {
    prisma.inquiryReplyAttempt.update = updateReceipt;
  }
  assert.equal(sends, receiptBefore + 1);
  await post(receiptFail.id, 'send-reply', receiptKey, { status: 409 });
  assert.equal(sends, receiptBefore + 1);
  const missingReceipt = await prisma.inquiryReplyAttempt.findFirst({
    where: { inquiryId: receiptFail.id },
  });
  assert.equal(missingReceipt.status, 'SENDING');
  await prisma.inquiryReplyAttempt.update({
    where: { id: missingReceipt.id },
    data: { createDate: new Date(Date.now() - 180000) },
  });
  await post(receiptFail.id, 'send-reply', receiptKey, {
    status: 503,
    code: 'INQUIRY_REPLY_DELIVERY_UNKNOWN',
  });
  await post(
    receiptFail.id,
    'send-reply',
    { ...receiptKey, requestId: randomUUID() },
    { status: 409 },
  );
  assert.equal(sends, receiptBefore + 1);
  // 발송 전 이력 실패는 예약 자체를 롤백해 외부 메일을 보내지 않는다.
  const reserveFail = await create();
  await post(reserveFail.id, 'start-processing');
  await patch(reserveFail.id, 0, '발송 예약 롤백 답변');
  const reservationBefore = sends;
  logs.record = async (activity, tx) => {
    if (activity.action === 'INQUIRY_REPLY_SEND')
      throw new Error('reservation failure');
    return originalRecord(activity, tx);
  };
  try {
    await post(
      reserveFail.id,
      'send-reply',
      { requestId: randomUUID(), expectedDraftVersion: 1 },
      { status: 500 },
    );
  } finally {
    logs.record = originalRecord;
  }
  assert.equal(sends, reservationBefore);
  assert.equal(
    await prisma.inquiryReplyAttempt.count({
      where: { inquiryId: reserveFail.id },
    }),
    0,
  );
  assert.equal(
    (await prisma.inquiry.findUnique({ where: { id: reserveFail.id } }))
      .activeReplyAttemptId,
    null,
  );
  // 초안·담당자 변경도 이력 실패 시 함께 롤백한다.
  logs.record = async () => {
    throw new Error('audit unavailable');
  };
  const startFail = await create();
  try {
    await post(startFail.id, 'start-processing', undefined, { status: 500 });
    await patch(reserveFail.id, 1, '롤백해야 할 초안', { status: 500 });
  } finally {
    logs.record = originalRecord;
  }
  assert.equal(
    (await prisma.inquiry.findUnique({ where: { id: startFail.id } }))
      .assignedAdminId,
    null,
  );
  assert.equal(
    (await prisma.inquiry.findUnique({ where: { id: reserveFail.id } }))
      .replyVersion,
    1,
  );
  // 회신 주소는 접수 당시 값이며 관리자 요청이나 이후 회원 이메일 변경으로 바뀌지 않는다.
  const address = await create({ replyEmail: 'receipt@customer.test' });
  await prisma.user.update({
    where: { id: locked.id },
    data: { email: 'changed@motu.test' },
  });
  await post(address.id, 'start-processing');
  await patch(address.id, 0, '회신 주소 보존 확인 답변');
  await post(address.id, 'send-reply', {
    requestId: randomUUID(),
    expectedDraftVersion: 1,
  });
  assert.equal(deliveries.at(-1).to, 'receipt@customer.test');
  assert(deliveries.at(-1).text.includes('\n\n문의번호:'));
  // 다른 관리자도 상세·이력은 읽을 수 있다. 이력은 페이지로 나눈다.
  const attempts = await json(
    `${route}/${failed.id}?attemptPage=1&attemptSize=1`,
    bt,
  );
  assert.equal(attempts.replyAttempts.items.length, 1);
  assert.equal(attempts.replyAttempts.totalCount, 2);
  const activities = await json(
    `/admin/activity-logs?targetType=INQUIRY&targetId=${failed.id}`,
    at,
  );
  assert(
    activities.items.some((item) => item.action === 'INQUIRY_REPLY_DRAFT_SAVE'),
  );
  assert(
    activities.items.some(
      (item) =>
        item.action === 'INQUIRY_REPLY_SEND' && item.result === 'FAILURE',
    ),
  );
  const finalState = await prisma.user.findUnique({
    where: { id: locked.id },
    select: { userStatus: true, loginFailCount: true, lastLoginDate: true },
  });
  assert.deepEqual(finalState, originalState);
  await json('/inquiries/' + submitted.id, it);
  await json('/inquiries', it);
  const swagger = await (await fetch(base + '/docs-json')).json();
  for (const [path, method] of [
    [route, 'get'],
    [route + '/{id}', 'get'],
    [route + '/{id}/start-processing', 'post'],
    [route + '/{id}/reply-draft', 'patch'],
    [route + '/{id}/send-reply', 'post'],
  ])
    assert(swagger.paths['/api' + path]?.[method].security.length);
  const page = swagger.paths['/api' + route].get.parameters.find(
    (item) => item.name === 'page',
  );
  assert.equal(page.schema.type, 'number');
  console.log(
    JSON.stringify({
      result: 'PASS',
      httpChecks: checks,
      providerCalls: sends,
      isolatedDatabase: true,
      externalMailSent: false,
      scenarios: [
        'permission',
        'search-pagination',
        'assignee-race',
        'draft-version',
        'concurrent-send',
        'known-failure',
        'simulation',
        'unknown-explicit-retry',
        'stale-request',
        'post-send-finalization-retry',
        'audit-rollback',
        'recipient-snapshot',
        'account-state-preserved',
      ],
    }),
  );
} finally {
  try {
    await peer?.close();
    await app?.close();
  } finally {
    try {
      if (created) await root.query('DROP DATABASE "' + name + '"');
    } finally {
      await root.end();
    }
  }
}
