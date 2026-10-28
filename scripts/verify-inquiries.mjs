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
let createdDatabase = false;
let base;
let checks = 0;
const check = (condition, message) => {
  assert(condition, message);
  checks++;
};
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
  for (const user of [locked, blocked]) {
    await call(
      '/inquiries/access-token',
      null,
      'POST',
      { loginId: user.loginId, password: 'wrong' },
      401,
      'INQUIRY_INVALID_CREDENTIALS',
    );
  }
  await call(
    '/inquiries/access-token',
    null,
    'POST',
    { loginId: 'missing', password },
    401,
    'INQUIRY_INVALID_CREDENTIALS',
  );
  await call(
    '/inquiries/access-token',
    null,
    'POST',
    { loginId: active.loginId, password },
    403,
    'INQUIRY_ACCOUNT_NOT_RESTRICTED',
  );
  const sessionA = await call('/inquiries/access-token', null, 'POST', {
    loginId: locked.loginId,
    password,
  });
  const sessionB = await call('/inquiries/access-token', null, 'POST', {
    loginId: blocked.loginId,
    password,
  });
  const a = sessionA.inquiryAccessToken;
  const b = sessionB.inquiryAccessToken;
  check(
    sessionA.expiresIn === 900 &&
      !sessionA.accessToken &&
      !sessionA.refreshToken,
    '일반 Access/Refresh 토큰 미발급',
  );
  const payload = jwt.decode(a);
  check(
    payload.purpose === 'INQUIRY' &&
      payload.exp - payload.iat === 900 &&
      payload.aud === 'inquiries',
    '문의 전용 목적·만료·수신자',
  );
  check(
    (await prisma.refreshToken.count()) === 0,
    '본인 확인이 일반 세션을 생성하지 않음',
  );
  check(
    (await prisma.user.findUnique({ where: { id: locked.id } }))
      .loginFailCount === 5,
    '잠금 실패 횟수 보존',
  );
  check(
    (await prisma.user.findUnique({ where: { id: locked.id } }))
      .lastLoginDate === null,
    '일반 로그인 성공으로 기록하지 않음',
  );
  for (const user of [locked, blocked])
    check(
      (await prisma.user.findUnique({ where: { id: user.id } })).userStatus ===
        user.userStatus,
      '본인 확인이 계정 제한을 해제하지 않음',
    );
  await call('/inquiries', null, 'GET', undefined, 401, 'INQUIRY_UNAUTHORIZED');
  await call(
    '/inquiries',
    'invalid',
    'GET',
    undefined,
    401,
    'INQUIRY_UNAUTHORIZED',
  );
  await call(
    '/inquiries',
    a + 'x',
    'GET',
    undefined,
    401,
    'INQUIRY_UNAUTHORIZED',
  );
  await call(
    '/inquiries',
    null,
    'POST',
    { title: '제목', content: '내용' },
    401,
    'INQUIRY_UNAUTHORIZED',
  );
  await call(
    '/inquiries/1',
    null,
    'GET',
    undefined,
    401,
    'INQUIRY_UNAUTHORIZED',
  );
  const signLimited = (claims, options = {}) =>
    jwt.signAsync(claims, {
      secret: inquiryTokenSecret(process.env.JWT_ACCESS_SECRET),
      issuer: 'motu-inquiries',
      audience: 'inquiries',
      expiresIn: 900,
      ...options,
    });
  await call(
    '/inquiries',
    await signLimited(
      { sub: locked.id, purpose: 'INQUIRY' },
      { expiresIn: -1 },
    ),
    'GET',
    undefined,
    401,
    'INQUIRY_TOKEN_EXPIRED',
  );
  for (const claims of [
    { sub: '1', purpose: 'INQUIRY' },
    { sub: 0, purpose: 'INQUIRY' },
    { sub: locked.id, purpose: 'OTHER' },
    { sub: locked.id },
  ]) {
    await call(
      '/inquiries',
      await signLimited(claims),
      'GET',
      undefined,
      401,
      'INQUIRY_UNAUTHORIZED',
    );
  }
  for (const options of [{ audience: 'orders' }, { issuer: 'other' }])
    await call(
      '/inquiries',
      await signLimited({ sub: locked.id, purpose: 'INQUIRY' }, options),
      'GET',
      undefined,
      401,
      'INQUIRY_UNAUTHORIZED',
    );
  const staleNormal = await jwt.signAsync({ sub: locked.id, role: 'USER' });
  await call(
    '/inquiries',
    staleNormal,
    'GET',
    undefined,
    401,
    'INQUIRY_UNAUTHORIZED',
  );
  await call(
    '/users/me',
    staleNormal,
    'GET',
    undefined,
    403,
    'AUTH_ACCOUNT_LOCKED',
  );
  for (const token of [a, b]) {
    await call('/users/me', token, 'GET', undefined, 401, 'AUTH_UNAUTHORIZED');
    await call(
      '/accounts/me',
      token,
      'GET',
      undefined,
      401,
      'AUTH_UNAUTHORIZED',
    );
  }
  const empty = await call('/inquiries', a);
  check(
    empty.totalCount === 0 &&
      empty.items.length === 0 &&
      empty.page === 1 &&
      empty.size === 10,
    '빈 문의 목록 기본값',
  );
  const createA = await call(
    '/inquiries',
    a,
    'POST',
    {
      title: '  잠금 해제 문의  ',
      content: '  계정 잠금을 확인해 주세요.\n본문 두 번째 줄  ',
    },
    201,
  );
  check(
    createA.status === 'SUBMITTED' &&
      createA.inquiryType === 'LOGIN_FAILED_LOCKED',
    '잠금 계정 접수 상태·유형 자동 결정',
  );
  check(
    /^INQ-\d{8}-[0-9A-F]{12}$/.test(createA.inquiryCode),
    '문의번호 발급 형식',
  );
  check(
    createA.title === '잠금 해제 문의' &&
      createA.content.endsWith('본문 두 번째 줄'),
    '앞뒤 공백 제거·줄바꿈 보존',
  );
  check(
    !('userId' in createA) && !('password' in createA) && !('email' in createA),
    '불필요한 회원 정보 미노출',
  );
  const createB = await call(
    '/inquiries',
    b,
    'POST',
    { title: '정지 확인', content: '정지 사유를 확인해 주세요.' },
    201,
  );
  check(
    createB.inquiryType === 'SUSPENDED' &&
      createA.inquiryCode !== createB.inquiryCode,
    '정지 계정 유형·번호 분리',
  );
  const detail = await call(`/inquiries/${createA.id}`, a);
  check(
    detail.inquiryCode === createA.inquiryCode &&
      detail.content === createA.content,
    '접수 결과 상세 조회 보존',
  );
  await call(
    `/inquiries/${createA.id}`,
    b,
    'GET',
    undefined,
    404,
    'INQUIRY_NOT_FOUND',
  );
  await call(
    `/inquiries/${createB.id}`,
    a,
    'GET',
    undefined,
    404,
    'INQUIRY_NOT_FOUND',
  );
  await call(
    '/inquiries/2147483647',
    a,
    'GET',
    undefined,
    404,
    'INQUIRY_NOT_FOUND',
  );
  await call(
    '/inquiries/2147483648',
    a,
    'GET',
    undefined,
    404,
    'INQUIRY_NOT_FOUND',
  );
  await call(
    '/inquiries/not-a-number',
    a,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  const beforeInvalid = await prisma.inquiry.count();
  for (const body of [
    {},
    { title: '', content: '본문' },
    { title: '   ', content: '본문' },
    { title: null, content: '본문' },
    { title: 1, content: '본문' },
    { title: '제목', content: '' },
    { title: '제목', content: '  \n ' },
    { title: '제목', content: null },
    { title: '제목', content: [] },
    { title: '가'.repeat(101), content: '본문' },
    { title: '제목', content: '가'.repeat(5001) },
    { title: '제목', content: '본문', userId: blocked.id },
    { title: '제목', content: '본문', status: 'APPROVED' },
    { title: '제목', content: '본문', inquiryType: 'SUSPENDED' },
    { title: '제목', content: '본문', inquiryCode: 'INQ-spoof' },
  ]) {
    const error = await call('/inquiries', a, 'POST', body, 400, 'BAD_REQUEST');
    check(/[가-힣]/.test(error.message), '한글 검증 문구');
  }
  check(
    (await prisma.inquiry.count()) === beforeInvalid,
    '검증 실패 시 DB 미저장',
  );
  await call(
    '/inquiries',
    a,
    'POST',
    { title: '가'.repeat(100), content: '나'.repeat(5000) },
    201,
  );
  for (const query of [
    'page=0',
    'page=-1',
    'page=abc',
    'page=1.5',
    'page=100001',
    'size=0',
    'size=51',
    'size=1.5',
    'userId=1',
    'status=SUBMITTED',
  ]) {
    await call(`/inquiries?${query}`, a, 'GET', undefined, 400, 'BAD_REQUEST');
  }
  const concurrent = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      call(
        '/inquiries',
        a,
        'POST',
        { title: `동시 문의 ${i}`, content: `서로 다른 문의 ${i}` },
        201,
      ),
    ),
  );
  check(
    new Set(concurrent.map((x) => x.inquiryCode)).size === 12,
    '동시 접수 12건 문의번호 중복 없음',
  );
  check(
    (await call('/inquiries', b)).totalCount === 1,
    '목록에서 타인 문의 제외',
  );
  const listA = await call('/inquiries?page=1&size=50', a);
  check(
    listA.totalCount === 14 && listA.items.length === 14,
    '본인 목록·전체 개수 일치',
  );
  const page1 = await call('/inquiries?page=1&size=5', a);
  const page2 = await call('/inquiries?page=2&size=5', a);
  check(
    page1.items.length === 5 &&
      page2.items.length === 5 &&
      !page1.items.some((x) => page2.items.some((y) => y.id === x.id)),
    '페이지 분리·중복 없음',
  );
  check(
    (await call('/inquiries?page=100000', a)).items.length === 0,
    '범위 밖 페이지 빈 목록',
  );
  await prisma.inquiry.updateMany({
    where: { userId: locked.id },
    data: { createDate: new Date('2026-10-01') },
  });
  const tied = await call('/inquiries?size=50', a);
  check(
    tied.items.every((x, i) => i === 0 || tied.items[i - 1].id > x.id),
    '같은 발생 시각의 정렬은 ID 내림차순',
  );
  const activeLogin = await call('/auth/login', null, 'POST', {
    loginId: active.loginId,
    password,
  });
  check(
    (await call('/inquiries', activeLogin.accessToken)).totalCount === 0,
    '정상 계정의 본인 이력 조회',
  );
  await call(
    '/inquiries',
    activeLogin.accessToken,
    'POST',
    { title: '제목', content: '본문' },
    403,
    'INQUIRY_ACCOUNT_NOT_RESTRICTED',
  );
  await prisma.user.update({
    where: { id: locked.id },
    data: { userStatus: 'ACTIVE' },
  });
  await call('/users/me', a, 'GET', undefined, 401, 'AUTH_UNAUTHORIZED');
  await call(
    '/inquiries',
    a,
    'POST',
    { title: '제목', content: '본문' },
    403,
    'INQUIRY_ACCOUNT_NOT_RESTRICTED',
  );
  check(
    (await call('/inquiries', a)).totalCount === 14,
    '제한 해제 뒤 문의 토큰은 기존 이력 조회만 가능',
  );
  const unlocked = await call('/auth/login', null, 'POST', {
    loginId: locked.loginId,
    password,
  });
  check(
    (await call('/inquiries', unlocked.accessToken)).totalCount === 14,
    '제한 해제 후 일반 토큰으로 이력 유지',
  );
  await call(
    `/inquiries/${createB.id}`,
    unlocked.accessToken,
    'GET',
    undefined,
    404,
    'INQUIRY_NOT_FOUND',
  );
  // 독립된 계정 키로 제한 테스트. 원래 테스트 계정·로그인 상태를 바꾸지 않는다.
  for (let i = 0; i < 10; i++)
    await call(
      '/inquiries/access-token',
      null,
      'POST',
      { loginId: 'throttleonly', password },
      401,
      'INQUIRY_INVALID_CREDENTIALS',
    );
  await call(
    '/inquiries/access-token',
    null,
    'POST',
    { loginId: 'throttleonly', password },
    429,
    'INQUIRY_TOO_MANY_ATTEMPTS',
  );
  const schema = await fetch(base.replace('/api', '') + '/api/docs-json').then(
    (r) => r.json(),
  );
  check(
    [
      '/api/inquiries/access-token',
      '/api/inquiries',
      '/api/inquiries/{inquiryId}',
    ].every((path) => schema.paths[path]),
    'Swagger 접수·본인 확인·목록·상세 등록',
  );
  check(
    !Object.keys(schema.paths).some((path) =>
      path.startsWith('/api/admin/inquiries'),
    ),
    '관리자 문의 변경 API 미노출',
  );
  check((await prisma.inquiry.count()) === 15, '예상 문의만 저장');
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      isolatedDatabase: true,
      productionChanged: false,
    }),
  );
} finally {
  if (app) await app.close();
  if (createdDatabase) await root.query(`DROP DATABASE "${databaseName}"`);
  await root.end();
}
