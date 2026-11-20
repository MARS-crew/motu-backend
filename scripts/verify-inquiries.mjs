// npm run build 후 실행. localhost의 별도 일회용 DB만 사용하고 항상 정리한다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';

const originalUrl = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(originalUrl.hostname),
  '로컬 DB만 허용합니다.',
);
const databaseName = `motu_inquiries_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const testUrl = new URL(originalUrl);
testUrl.pathname = `/${databaseName}`;
const root = new pg.Client({ connectionString: originalUrl.toString() });
let app;
let peerApp;
let createdDatabase = false;
let base;
let checks = 0;
const check = (condition, message) => {
  assert(condition, message);
  checks++;
};
async function call(
  path,
  token,
  method = 'GET',
  body,
  status = 200,
  code,
  origin = base,
) {
  const response = await fetch(origin + path, {
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
    `${method} ${path}: ${response.status}, expected ${status}; code=${result.error?.code}`,
  );
  if (code) assert.equal(result.error?.code, code);
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
  const { inquiryTokenSecret } =
    await import('../dist/modules/inquiries/inquiries.constants.js');
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  setupSwagger(app);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  const prisma = app.get(PrismaService);
  const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
  const password = 'Inquiry-test1!';
  const passwordHash = await argon2.hash(password);
  const users = [];
  for (const userStatus of ['LOCKED', 'BLOCKED', 'ACTIVE']) {
    users.push(
      await prisma.user.create({
        data: {
          loginId: `inquiry${userStatus.toLowerCase()}`,
          password: passwordHash,
          email: `${userStatus.toLowerCase()}@motu.test`,
          nickname: userStatus,
          birthDate: new Date('2000-01-01'),
          termsAgreed: true,
          privacyAgreed: true,
          marketingAgreed: false,
          userStatus,
          loginFailCount: userStatus === 'LOCKED' ? 5 : 0,
        },
      }),
    );
  }
  const [locked, blocked, active] = users;
  const userToken = (
    await call('/auth/login', null, 'POST', {
      loginId: active.loginId,
      password,
    })
  ).accessToken;
  const limitedToken = (userId, extra = {}) =>
    jwt.signAsync(
      { sub: userId, purpose: 'INQUIRY' },
      {
        secret: inquiryTokenSecret(process.env.JWT_ACCESS_SECRET),
        issuer: 'motu-inquiries',
        audience: 'inquiries',
        expiresIn: 900,
        ...extra,
      },
    );
  const oldToken = await limitedToken(locked.id);
  const oldOtherToken = await limitedToken(blocked.id);
  const create = (u, status = 'SUBMITTED') =>
    prisma.inquiry.create({
      data: {
        userId: u.id,
        inquiryCode: 'INQ-LEGACY-' + randomUUID().slice(0, 8),
        inquiryType:
          u.userStatus === 'LOCKED' ? 'LOGIN_FAILED_LOCKED' : 'SUSPENDED',
        title: '이전 문의',
        content: '과거 내역 보존',
        status,
        replyEmail: u.email,
      },
    });
  const first = await create(locked);
  const completed = await create(locked, 'COMPLETED');
  const other = await create(blocked);
  const activeHistory = await create(active);
  const publicInquiry = await prisma.inquiry.create({
    data: {
      userId: null,
      source: 'PUBLIC_ACCOUNT_AUTH',
      inquiryCode: 'INQ-PUBLIC-' + randomUUID().slice(0, 8),
      inquiryType: 'SUSPENDED',
      title: '공개 문의',
      content: '이메일 회원 추정 금지',
      replyEmail: locked.email,
    },
  });
  const state = async () => ({
    users: await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        userStatus: true,
        loginFailCount: true,
        lastLoginDate: true,
      },
    }),
    attempts: await prisma.inquiryAccessAttempt.findMany(),
    inquiryCount: await prisma.inquiry.count(),
    refreshCount: await prisma.refreshToken.count(),
  });
  const before = await state();
  // 종료 경로는 비밀번호·회원 상태·토큰과 무관하게 410이며 DB/인증에 부작용이 없다.
  for (const route of ['/inquiries/access-token', '/inquiries']) {
    for (const token of [null, oldToken, userToken]) {
      for (const input of [
        {},
        { loginId: locked.loginId, password },
        { loginId: active.loginId, password: 'wrong' },
        { loginId: 'missing', password },
        { title: '제목', content: '본문' },
      ]) {
        await call(
          route,
          token,
          'POST',
          input,
          410,
          'INQUIRY_SUBMISSION_RETIRED',
        );
      }
    }
  }
  assert.deepEqual(await state(), before);
  checks++;
  for (const token of [
    null,
    'invalid',
    oldToken + 'x',
    await limitedToken(locked.id, { expiresIn: -1 }),
    await limitedToken(locked.id, { audience: 'other' }),
  ]) {
    await call('/inquiries', token, 'GET', undefined, 401);
  }
  const lockedNormalToken = await jwt.signAsync(
    { sub: locked.id, role: 'USER' },
    { expiresIn: 900 },
  );
  await call('/inquiries', lockedNormalToken, 'GET', undefined, 401);
  const page1 = await call('/inquiries?page=1&size=1', oldToken);
  const page2 = await call('/inquiries?page=2&size=1', oldToken);
  assert.equal(page1.totalCount, 2);
  assert.equal(page2.totalCount, 2);
  assert.equal(page1.items.length, 1);
  assert.equal(page2.items.length, 1);
  assert.notEqual(page1.items[0].id, page2.items[0].id);
  assert(
    page1.items
      .concat(page2.items)
      .every((i) => [first.id, completed.id].includes(i.id)),
  );
  checks++;
  assert.equal(
    (await call('/inquiries/' + completed.id, oldToken)).status,
    'COMPLETED',
  );
  assert.equal((await call('/inquiries', oldOtherToken)).totalCount, 1);
  assert.equal(
    (await call('/inquiries/' + activeHistory.id, userToken)).id,
    activeHistory.id,
  );
  for (const id of [other.id, publicInquiry.id, 2147483647]) {
    await call(
      '/inquiries/' + id,
      oldToken,
      'GET',
      undefined,
      404,
      'INQUIRY_NOT_FOUND',
    );
  }
  for (const id of ['0', '-1', '2147483648'])
    await call('/inquiries/' + id, oldToken, 'GET', undefined, 404);
  for (const id of ['abc', '1.5'])
    await call('/inquiries/' + id, oldToken, 'GET', undefined, 400);
  for (const query of ['page=0', 'size=101', 'page=bad'])
    await call('/inquiries?' + query, oldToken, 'GET', undefined, 400);
  await call('/users/me', oldToken, 'GET', undefined, 401);
  // 문의 JWT는 Refresh DTO의 길이 제한에서도 거부되며 일반 세션을 만들지 않는다.
  await call('/auth/refresh', null, 'POST', { refreshToken: oldToken }, 400);
  await call(
    '/auth/login',
    null,
    'POST',
    { loginId: locked.loginId, password },
    403,
    'AUTH_ACCOUNT_LOCKED',
  );
  await call(
    '/auth/login',
    null,
    'POST',
    { loginId: blocked.loginId, password },
    403,
    'AUTH_ACCOUNT_BLOCKED',
  );
  assert.deepEqual(await state(), before);
  checks++;
  await prisma.user.update({
    where: { id: locked.id },
    data: { userStatus: 'ACTIVE' },
  });
  const restored = await jwt.signAsync(
    { sub: locked.id, role: 'USER' },
    { expiresIn: 900 },
  );
  assert.equal((await call('/inquiries', restored)).totalCount, 2);
  await call(
    '/inquiries',
    oldToken,
    'POST',
    { title: '제목', content: '본문' },
    410,
    'INQUIRY_SUBMISSION_RETIRED',
  );
  const swagger = await (await fetch(base + '/docs-json')).json();
  assert(!swagger.paths['/api/inquiries/access-token']);
  assert(!swagger.paths['/api/inquiries'].post);
  assert(swagger.paths['/api/inquiries'].get);
  assert(swagger.paths['/api/account-inquiries'].post);
  assert.deepEqual(
    swagger.components.schemas.InquiryResDto.properties.status.enum,
    ['SUBMITTED', 'IN_PROGRESS', 'COMPLETED'],
  );
  checks++;
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      isolatedDatabase: true,
      productionChanged: false,
      legacySubmissionRetired: true,
      legacyHistoryPreserved: true,
    }),
  );
} finally {
  if (peerApp) await peerApp.close();
  if (app) await app.close();
  if (createdDatabase) await root.query(`DROP DATABASE "${databaseName}"`);
  await root.end();
}
