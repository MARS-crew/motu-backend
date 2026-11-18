// npm run build 후 실행. 비운영 localhost 일회용 DB·모의 메일로 전체 접수→답변 흐름을 확인한다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
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
  'motu_public_inquiry_' + randomUUID().replaceAll('-', '').slice(0, 12);
const url = new URL(original);
url.pathname = '/' + name;
const root = new pg.Client({ connectionString: original.toString() });
let created = false,
  app,
  peer,
  base,
  peerBase,
  checks = 0;
let deliveries = [];
let provider = async () => ({
  mode: 'BREVO',
  messageId: '<public-inquiry@brevo.test>',
});
async function request(
  path,
  { token, method = 'GET', body, origin = base, headers = {} } = {},
) {
  return fetch(origin + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json(path, options = {}) {
  const r = await request(path, options),
    value = await r.json();
  assert.equal(
    r.status,
    options.status ?? 200,
    `${options.method ?? 'GET'} ${path}: ${JSON.stringify(value)}`,
  );
  if (options.code) assert.equal(value.error?.code, options.code);
  checks++;
  return r.status < 400 ? value.data : value.error;
}
const publicRoute = '/account-inquiries',
  adminRoute = '/admin/inquiries';
const body = (patch = {}) => ({
  inquiryType: 'PHONE_UNAVAILABLE',
  replyEmail: 'reply-' + randomUUID() + '@example.com',
  content: '등록한 휴대폰 사용이 불가능합니다. 변경 절차를 안내해 주세요.',
  ...patch,
});
const submit = (input, options = {}) =>
  json(publicRoute, { method: 'POST', body: input, status: 201, ...options });
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
  const { InquirySubmissionLimiter } =
    await import('../dist/modules/inquiries/inquiry-submission-limiter.service.js');
  const { InquiryType } = await import('../dist/generated/prisma/client.js');
  const makeApp = async () => {
    const a = await NestFactory.create(AppModule, { logger: false });
    setupApp(a);
    setupSwagger(a);
    a.get(MailSender).sendTracked = async (mail) => {
      deliveries.push(mail);
      return provider(mail);
    };
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
  const user = (loginId, userStatus = 'ACTIVE', role = 'USER') =>
    prisma.user.create({
      data: {
        loginId,
        nickname: loginId,
        password: passwordHash,
        email: loginId + '@example.com',
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        userStatus,
        role,
        loginFailCount: userStatus === 'LOCKED' ? 5 : 0,
      },
    });
  const locked = await user('publocked', 'LOCKED'),
    active = await user('pubactive'),
    blocked = await user('pubblocked', 'BLOCKED'),
    admin = await user('pubadmin', 'ACTIVE', 'ADMIN');
  const login = async (u) =>
    (
      await json('/auth/login', {
        method: 'POST',
        body: { loginId: u.loginId, password },
      })
    ).accessToken;
  const adminToken = await login(admin),
    userToken = await login(active);
  const state = async () =>
    prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        userStatus: true,
        loginFailCount: true,
        lastLoginDate: true,
        email: true,
      },
    });
  const beforeUsers = await state();
  const receipts = [];
  for (const inquiryType of Object.values(InquiryType)) {
    const input = body({ inquiryType });
    const receipt = await submit(input);
    assert.match(receipt.inquiryCode, /^INQ-\d{8}-[A-F0-9]{12}$/);
    assert.equal(receipt.status, 'SUBMITTED');
    assert(receipt.createDate);
    assert.deepEqual(Object.keys(receipt).sort(), [
      'createDate',
      'inquiryCode',
      'message',
      'status',
    ]);
    const saved = await prisma.inquiry.findUniqueOrThrow({
      where: { inquiryCode: receipt.inquiryCode },
    });
    assert.equal(saved.source, 'PUBLIC_ACCOUNT_AUTH');
    assert.equal(saved.userId, null);
    assert.equal(saved.replyEmail, input.replyEmail);
    assert.equal(saved.inquiryType, inquiryType);
    receipts.push(saved);
  }
  assert.equal(deliveries.length, 0, '접수 자체는 메일을 보내지 않는다.');
  assert.equal(new Set(receipts.map((r) => r.inquiryCode)).size, 3);
  // 같은 주소가 실제 회원에게 있든 없든 응답·처리는 같다. 계정을 추정해 연결하지 않는다.
  const sameEmail = await submit(
    body({
      replyEmail: '  ' + locked.email + '  ',
      content: ' 문의 첫 줄\n둘째 줄 ',
    }),
  );
  const linked = await prisma.inquiry.findUniqueOrThrow({
    where: { inquiryCode: sameEmail.inquiryCode },
  });
  assert.equal(linked.userId, null);
  assert.equal(linked.replyEmail, locked.email);
  assert.equal(linked.content, '문의 첫 줄\n둘째 줄');
  await submit(body({ replyEmail: active.email }));
  await submit(body({ replyEmail: blocked.email }));
  assert.deepEqual(await state(), beforeUsers);
  // 공개 접수로 회원 연결·상태·수신자 정책을 우회할 수 없다.
  for (const patch of [
    { inquiryType: null },
    { inquiryType: 'GENERAL' },
    { replyEmail: '' },
    { replyEmail: 'bad' },
    { replyEmail: 'reply@example.com\r\nBcc:other@example.com' },
    { content: '' },
    { content: ' ' },
    { content: null },
    { content: '가'.repeat(5001) },
    { userId: locked.id },
    { title: '주입' },
    { loginId: locked.loginId },
    { password },
    { source: 'RESTRICTED_ACCOUNT' },
    { status: 'APPROVED' },
    { assignedAdminId: admin.id },
  ])
    await submit(body(patch), { status: 400, code: 'BAD_REQUEST' });
  // 공개 내역 조회나 영수증·이메일만으로 본인 조회는 허용하지 않는다.
  await json(publicRoute, { status: 404 });
  await json('/inquiries', { status: 401 });
  await json('/inquiries/' + linked.id, { status: 401 });
  await json('/inquiries/' + linked.id, {
    token: userToken,
    status: 404,
    code: 'INQUIRY_NOT_FOUND',
  });
  const inquiryToken = (
    await json('/inquiries/access-token', {
      method: 'POST',
      body: { loginId: locked.loginId, password },
    })
  ).inquiryAccessToken;
  await json('/inquiries/' + linked.id, {
    token: inquiryToken,
    status: 404,
    code: 'INQUIRY_NOT_FOUND',
  });
  assert.equal(
    (await json('/inquiries', { token: inquiryToken })).totalCount,
    0,
  );
  const legacy = await json('/inquiries', {
    token: inquiryToken,
    method: 'POST',
    status: 201,
    body: {
      title: '기존 본인 확인 문의',
      content: '기존 문의는 계속 사용할 수 있습니다.',
    },
  });
  assert.equal(
    (await prisma.inquiry.findUniqueOrThrow({ where: { id: legacy.id } }))
      .source,
    'RESTRICTED_ACCOUNT',
  );
  assert.equal(
    (await json('/inquiries', { token: inquiryToken })).totalCount,
    1,
  );
  await json(adminRoute, { status: 401 });
  await json(adminRoute, { token: userToken, status: 403 });
  const phone = receipts.find((r) => r.inquiryType === 'PHONE_UNAVAILABLE');
  const found = await json(adminRoute + '?keyword=' + phone.inquiryCode, {
    token: adminToken,
  });
  assert.equal(found.totalCount, 1);
  assert.equal(found.items[0].id, phone.id);
  assert.equal(found.items[0].source, 'PUBLIC_ACCOUNT_AUTH');
  assert.equal(
    (
      await json(
        adminRoute + '?inquiryType=PHONE_UNAVAILABLE&status=SUBMITTED',
        { token: adminToken },
      )
    ).items.some((i) => i.id === phone.id),
    true,
  );
  const detail = await json(adminRoute + '/' + phone.id, { token: adminToken });
  assert.equal(detail.replyEmail, phone.replyEmail);
  assert.equal(detail.status, 'SUBMITTED');
  const action = (id, path, input, options = {}) =>
    json(`${adminRoute}/${id}/${path}`, {
      token: adminToken,
      method: 'POST',
      body: input,
      ...options,
    });
  const draft = async (id, text) => {
    await action(id, 'start-processing');
    return json(`${adminRoute}/${id}/reply-draft`, {
      token: adminToken,
      method: 'PATCH',
      body: { expectedVersion: 0, replyText: text },
    });
  };
  const savedDraft = await draft(
    phone.id,
    '등록 휴대폰 변경 절차를 안내드립니다.\n추가 정보는 별도 본인 확인 후 안내드립니다.',
  );
  const sendBody = {
    requestId: randomUUID(),
    expectedDraftVersion: savedDraft.replyVersion,
  };
  await action(
    phone.id,
    'send-reply',
    { ...sendBody, toEmail: active.email },
    { status: 400 },
  );
  await action(phone.id, 'send-reply', sendBody);
  await action(phone.id, 'send-reply', sendBody);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].to, phone.replyEmail);
  assert(deliveries[0].text.includes(savedDraft.replyDraft));
  assert(deliveries[0].subject.includes(phone.inquiryCode));
  const completed = await json(adminRoute + '/' + phone.id, {
    token: adminToken,
  });
  assert.equal(completed.status, 'APPROVED');
  assert(completed.completedAt);
  assert.equal(completed.replyAttempts.totalCount, 1);
  assert.equal(completed.latestReplyAttempt.status, 'ACCEPTED');
  assert.equal(completed.canEdit, false);
  assert.equal(
    await prisma.adminActivityLog.count({
      where: { targetType: 'INQUIRY', targetId: BigInt(phone.id) },
    }),
    4,
  );
  // 입력 주소를 다른 회원의 주소로 바꾸거나 계정 상태를 바꾸지 않는다.
  await draft(
    linked.id,
    '계정 잠금 해제는 별도 본인 확인 및 회원 관리에서 진행합니다.',
  );
  await prisma.user.update({
    where: { id: locked.id },
    data: { email: 'changed@example.com' },
  });
  await action(linked.id, 'send-reply', {
    requestId: randomUUID(),
    expectedDraftVersion: 1,
  });
  assert.equal(deliveries.at(-1).to, locked.email);
  await prisma.user.update({
    where: { id: locked.id },
    data: { email: locked.email },
  });
  // 확정 실패는 초안을 유지하고, 콘솔 테스트는 완료로 간주하지 않는다.
  const failed = receipts.find((r) => r.inquiryType === 'SUSPENDED');
  await draft(failed.id, '이메일 공급자 실패 시 보존할 초안입니다.');
  provider = async () => {
    throw new TrackedMailError('FAILED');
  };
  const failedKey = { requestId: randomUUID(), expectedDraftVersion: 1 };
  await action(failed.id, 'send-reply', failedKey, {
    status: 503,
    code: 'INQUIRY_REPLY_SEND_FAILED',
  });
  const calls = deliveries.length;
  await action(failed.id, 'send-reply', failedKey, { status: 503 });
  assert.equal(deliveries.length, calls);
  let failedView = await json(adminRoute + '/' + failed.id, {
    token: adminToken,
  });
  assert.equal(failedView.status, 'IN_PROGRESS');
  assert.equal(failedView.replyVersion, 1);
  assert(failedView.replyDraft);
  assert.equal(failedView.completedAt, null);
  provider = async () => ({ mode: 'CONSOLE', messageId: null });
  await action(failed.id, 'send-reply', {
    requestId: randomUUID(),
    expectedDraftVersion: 1,
  });
  failedView = await json(adminRoute + '/' + failed.id, { token: adminToken });
  assert.equal(failedView.latestReplyAttempt.status, 'SIMULATED');
  assert.equal(failedView.completedAt, null);
  assert.equal(failedView.status, 'IN_PROGRESS');
  assert.deepEqual(await state(), beforeUsers);

  // 요청 제한은 두 Nest 인스턴스가 같은 DB를 사용해도 원자적으로 적용된다.
  await prisma.inquirySubmissionLimit.deleteMany();
  const limited = body({ replyEmail: 'limit@example.com' });
  const races = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      request(publicRoute, {
        method: 'POST',
        body: {
          ...limited,
          replyEmail: i % 2 ? 'LIMIT@EXAMPLE.COM' : limited.replyEmail,
        },
        origin: i % 2 ? peerBase : base,
      }),
    ),
  );
  assert.deepEqual(
    races.map((r) => r.status).sort(),
    [201, 201, 201, 429, 429, 429, 429, 429],
  );
  checks += races.length;
  for (const r of races) {
    const v = await r.json();
    if (r.status === 429)
      assert.equal(v.error.code, 'INQUIRY_SUBMISSION_RATE_LIMITED');
  }
  assert.equal(
    await prisma.inquiry.count({
      where: {
        replyEmail: { equals: limited.replyEmail, mode: 'insensitive' },
      },
    }),
    3,
  );
  const limits = await prisma.inquirySubmissionLimit.findMany();
  assert.equal(limits.length, 2);
  assert(limits.every((l) => /^[a-f0-9]{64}$/.test(l.key)));
  assert(
    limits.some((l) => l.count === 3),
    '실패 요청으로 회신 주소별 접수 상한을 넘길 수 없다.',
  );
  // 만료 후 초기화·청소. 만료되지 않은 이메일 제한은 그대로 유지한다.
  const limiter = app.get(InquirySubmissionLimiter);
  await prisma.inquirySubmissionLimit.updateMany({
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await submit(limited);
  assert.equal(await prisma.inquirySubmissionLimit.count(), 2);
  // DB 생성 실패 시 이메일 접수 횟수도 롤백한다.
  await prisma.inquirySubmissionLimit.deleteMany();
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await limiter.consumeEmail(tx, 'rollback@example.com');
      throw new Error('abort');
    }),
  );
  assert.equal(await prisma.inquirySubmissionLimit.count(), 0);
  // IP 제한은 여러 인스턴스·변조 Forwarded 헤더·다른 이메일로 우회할 수 없다.
  const ipRaces = await Promise.all(
    Array.from({ length: 65 }, (_, i) =>
      request(publicRoute, {
        method: 'POST',
        body: { content: '' },
        origin: i % 2 ? peerBase : base,
        headers: { 'x-forwarded-for': `198.51.100.${i + 1}` },
      }),
    ),
  );
  assert.equal(ipRaces.filter((r) => r.status === 400).length, 60);
  assert.equal(ipRaces.filter((r) => r.status === 429).length, 5);
  checks += ipRaces.length;
  for (const r of ipRaces) await r.arrayBuffer();
  assert(
    (await prisma.inquirySubmissionLimit.findMany()).every(
      (l) => l.count <= 61,
    ),
  );
  await prisma.inquirySubmissionLimit.updateMany({
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await submit(body());
  // DB 제약으로 공개 문의에 임의 회원 연결도 차단한다.
  await assert.rejects(
    prisma.inquiry.create({
      data: {
        userId: locked.id,
        source: 'PUBLIC_ACCOUNT_AUTH',
        inquiryCode: 'INQ-INVALID-' + randomUUID().slice(0, 8),
        inquiryType: 'SUSPENDED',
        title: 'invalid',
        content: 'invalid',
        replyEmail: locked.email,
      },
    }),
  );
  const swagger = await (await fetch(base + '/docs-json')).json();
  assert(!swagger.paths['/api/account-inquiries'].post.security?.length);
  assert.deepEqual(
    Object.keys(
      swagger.components.schemas.CreateAccountInquiryReqDto.properties,
    ).sort(),
    ['content', 'inquiryType', 'replyEmail'],
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      httpChecks: checks,
      providerCalls: deliveries.length,
      isolatedDatabase: true,
      externalMailSent: false,
      scenarios: [
        'anonymous-three-types',
        'no-member-inference',
        'validation',
        'private-history',
        'legacy-compatible',
        'admin-reply',
        'recipient-snapshot',
        'send-deduplication',
        'failed-draft-preserved',
        'console-not-completed',
        'account-state-preserved',
        'distributed-email-ip-limits',
        'quota-expiry-rollback',
        'database-constraint',
        'swagger',
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
