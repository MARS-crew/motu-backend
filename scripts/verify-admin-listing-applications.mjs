// npm run build 후 실행. 일회용 로컬 DB와 파일 저장소를 사용한다.
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

const dbUrl = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(dbUrl.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost PostgreSQL에서만 실행할 수 있습니다.',
);
const dbName =
  'motu_admin_listing_' + randomUUID().replaceAll('-', '').slice(0, 12);
const adminDb = new pg.Client({ connectionString: dbUrl.toString() });
dbUrl.pathname = '/' + dbName;
const tempRoot = resolve(tmpdir());
const uploads = await mkdtemp(join(tempRoot, 'motu-admin-listing-'));
let app;
let createdDatabase = false;
let base;
let checks = 0;
const route = '/admin/listing-applications';
const filesRoute = '/files/collections';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.7\nMOTU download fixture\n%%EOF\n');

function request(path, token, method = 'GET', body) {
  return fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      body === undefined || body instanceof FormData
        ? body
        : JSON.stringify(body),
  });
}

async function json(path, token, options = {}) {
  const { method, body, status = 200, code } = options;
  const response = await request(path, token, method, body);
  const result = await response.json();
  assert.equal(response.status, status, path + ' ' + JSON.stringify(result));
  if (code) assert.equal(result.error?.code, code, path);
  checks++;
  return result.data;
}

try {
  await adminDb.connect();
  await adminDb.query('CREATE DATABASE "' + dbName + '"');
  createdDatabase = true;
  Object.assign(process.env, {
    DATABASE_URL: dbUrl.toString(),
    NODE_ENV: 'test',
    FILE_STORAGE_DRIVER: 'local',
    FILE_LOCAL_DIRECTORY: uploads,
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
  const { setupApp } = await import('../dist/setup-app.js');
  const { setupSwagger } = await import('../dist/config/swagger.config.js');
  const { PrismaService } =
    await import('../dist/common/prisma/prisma.service.js');
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  setupSwagger(app);
  await app.listen(0, '127.0.0.1');
  base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api';
  const prisma = app.get(PrismaService);

  const password = 'Listing-Test1!';
  const passwordHash = await hash(password);
  const createAccount = async (loginId, role, nickname = loginId) => {
    const user = await prisma.user.create({
      data: {
        loginId,
        role,
        password: passwordHash,
        nickname,
        email: loginId + '@motu.test',
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
      },
    });
    const login = await json('/auth/login', null, {
      method: 'POST',
      body: { loginId, password },
    });
    assert.equal(login.user.userId, user.id);
    return { id: user.id, token: login.accessToken };
  };
  const admin = await createAccount('adminlist', 'ADMIN');
  const owner = await createAccount('ownerlist', 'USER', '김신청');
  const other = await createAccount('otherlist', 'USER');
  await prisma.sector.createMany({
    data: [
      { code: 1, name: 'SaaS / 소프트웨어' },
      { code: 2, name: 'AI / 데이터' },
    ],
  });
  const createEvidence = async (
    token,
    { withLink = false, asPdf = false } = {},
  ) => {
    const { id } = await json(filesRoute, token, {
      method: 'POST',
      status: 201,
      body: { purpose: 'EVIDENCE' },
    });
    const path = filesRoute + '/' + id;
    const form = new FormData();
    form.append(
      'files',
      new Blob([asPdf ? pdf : png], {
        type: asPdf ? 'application/pdf' : 'image/png',
      }),
      asPdf ? 'evidence.pdf' : 'evidence.png',
    );
    form.append('files', new Blob([png], { type: 'image/png' }), 'unsaved.png');
    const [saved, unsaved] = await json(path + '/uploads', token, {
      method: 'POST',
      status: 201,
      body: form,
    });
    const link = withLink
      ? await json(path + '/links', token, {
          method: 'POST',
          status: 201,
          body: { url: 'https://example.com/evidence' },
        })
      : null;
    const collection = await json(path, token, {
      method: 'PUT',
      body: {
        attachmentIds: [saved.id, ...(link ? [link.id] : [])],
        description: '관리자 심사 다운로드 테스트 증빙입니다.',
      },
    });
    return { id, saved, unsaved, link, collection };
  };
  const current = await createEvidence(owner.token, { withLink: true });
  const previous = await createEvidence(owner.token, { asPdf: true });
  const unrelated = await createEvidence(owner.token);
  const foreign = await createEvidence(other.token);
  const submittedAt = new Date('2026-11-01T00:00:00+09:00');
  const listing = (applicationNumber, serviceName, extra = {}) =>
    prisma.listingApplication.create({
      data: {
        userId: owner.id,
        applicationNumber,
        serviceName,
        submittedAt,
        status: 'SUBMITTED',
        expiresAt: new Date('2099-01-01'),
        ...extra,
      },
    });
  const submitted = await listing('LST-261101-001', 'Alpha Market', {
    draftData: {
      serviceName: 'Alpha Market',
      sectorCode: 1,
      evidenceCollectionId: current.id,
      mainImageCollectionId: foreign.id,
    },
    status: 'UNDER_REVIEW',
    reviewComment: '이전 보완 요청',
  });
  const second = await listing('LST-261101-002', 'ALPHA_마켓', {
    status: 'APPROVED',
    userId: other.id,
    draftData: { evidenceCollectionId: foreign.id, sectorCode: 2 },
  });
  const newSubmission = await listing('LST-261102-001', 'Beta', {
    submittedAt: new Date('2026-11-02T00:00:00+09:00'),
    draftData: { sectorCode: 999 },
  });
  const older = await listing('LST-260901-001', 'Older', {
    submittedAt: new Date('2026-09-01T00:00:00+09:00'),
  });
  const hidden = [
    await listing(null, 'Draft', { status: 'DRAFT', submittedAt: null }),
    await listing('LST-EXPIRED', 'Expired', { status: 'EXPIRED' }),
    await listing('LST-DELETED', 'Deleted', { deletedDate: new Date() }),
    await listing('LST-NOT-SUBMITTED', 'Missing date', { submittedAt: null }),
    await listing(null, 'Missing number'),
    await listing('', 'Empty number'),
  ];
  const revision = await prisma.listingApplicationRevision.create({
    data: {
      applicationId: submitted.id,
      requestedById: admin.id,
      requestContent: '보완 요청 이력',
      deadline: new Date('2026-11-08T00:00:00Z'),
      previousData: {},
      resubmittedAt: new Date('2026-11-04T00:00:00Z'),
      evidenceCollectionId: previous.id,
      evidenceSnapshot: previous.collection,
    },
  });
  // 과거 스냅샷에는 없는 파일이 나중에 같은 묶음에 저장되어도 다운로드할 수 없다.
  await prisma.attachment.update({
    where: { id: previous.unsaved.id },
    data: { saved: true },
  });

  const detailPath = route + '/' + submitted.id;
  const downloadPath = (attachmentId) =>
    detailPath + '/attachments/' + attachmentId + '/content';
  for (const path of [route, detailPath, downloadPath(current.saved.id)]) {
    await json(path, null, { status: 401 });
    await json(path, owner.token, { status: 403, code: 'AUTH_FORBIDDEN' });
  }
  const list = await json(route, admin.token);
  assert.equal(list.totalCount, 4);
  assert.deepEqual([list.page, list.size], [1, 20]);
  assert.deepEqual(
    list.items.map(({ id }) => id),
    [newSubmission.id, second.id, submitted.id, older.id],
  );
  assert.deepEqual(list.items.find(({ id }) => id === submitted.id).applicant, {
    userId: owner.id,
    loginId: 'ownerlist',
    nickname: '김신청',
  });
  assert.deepEqual(
    list.items.map(({ sectorCode, sectorName }) => [sectorCode, sectorName]),
    [
      [999, null],
      [2, 'AI / 데이터'],
      [1, 'SaaS / 소프트웨어'],
      [null, null],
    ],
  );
  assert(list.items.every((item) => !Object.hasOwn(item, 'draftData')));
  for (const [query, expected] of [
    ['?keyword=alpha&size=1&page=1', [second.id]],
    ['?keyword=alpha&size=1&page=2', [submitted.id]],
    ['?keyword=261101-001&status=UNDER_REVIEW', [submitted.id]],
    ['?keyword=%5F', [second.id]],
    ['?keyword=%25', []],
    ['?keyword=OTHERLIST', [second.id]],
    [
      '?keyword=' + encodeURIComponent('김신'),
      [newSubmission.id, submitted.id, older.id],
    ],
    ['?applicant=%20OTHERLI%20', [second.id]],
    [
      '?applicant=' + encodeURIComponent('김신청'),
      [newSubmission.id, submitted.id, older.id],
    ],
    ['?applicant=Alpha', []],
    ['?applicant=%25', []],
    ['?sectorCode=1', [submitted.id]],
    ['?sectorCode=2', [second.id]],
    ['?sectorCode=3', []],
    [
      '?keyword=alpha&applicant=otherlist&sectorCode=2&status=APPROVED&size=1',
      [second.id],
    ],
    ['?keyword=alpha&applicant=otherlist&sectorCode=1', []],
    [
      '?from=2026-10-03T00:00:00%2B09:00&to=2026-11-02T00:00:00%2B09:00',
      [second.id, submitted.id],
    ],
    [
      '?from=2026-11-01T00:00:00%2B09:00&to=2026-11-02T00:00:00%2B09:00',
      [second.id, submitted.id],
    ],
  ]) {
    const result = await json(route + query, admin.token);
    assert.deepEqual(
      result.items.map(({ id }) => id),
      expected,
    );
    assert.equal(
      result.totalCount,
      query.includes('keyword=alpha&size=1') ? 2 : expected.length,
    );
  }
  for (const query of [
    '?status=DRAFT',
    '?page=0',
    '?size=101',
    '?sectorCode=0',
    '?sectorCode=1.5',
    '?sectorCode=1&sectorCode=2',
    '?sectorCode=not-a-number',
    '?applicant=' + 'x'.repeat(31),
    '?from=2026-11-01',
    '?from=2026-02-30T00:00:00Z',
  ]) {
    await json(route + query, admin.token, {
      status: 400,
      code: 'BAD_REQUEST',
    });
  }
  await json(
    route + '?from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z',
    admin.token,
    {
      status: 400,
      code: 'LISTING_INVALID_SUBMITTED_PERIOD',
    },
  );
  for (const id of [...hidden.map((item) => item.id), 2147483648]) {
    await json(route + '/' + id, admin.token, {
      status: 404,
      code: 'LISTING_APPLICATION_NOT_FOUND',
    });
  }

  const detail = await json(detailPath, admin.token);
  assert.equal(detail.statusLabel, '검토 중');
  assert.equal(detail.sectorCode, 1);
  assert.equal(detail.sectorName, 'SaaS / 소프트웨어');
  assert.equal(detail.data.serviceName, submitted.serviceName);
  assert.equal(detail.reviewComment, '이전 보완 요청');
  assert.equal(detail.attachments.mainImage, null);
  assert.deepEqual(
    detail.attachments.evidence.attachments.map(({ id }) => id).sort(),
    [current.saved.id, current.link.id].sort(),
  );
  const evidenceFiles = detail.attachments.evidence.attachments;
  assert.equal(
    evidenceFiles.find(({ kind }) => kind === 'LINK').downloadPath,
    null,
  );
  assert.equal(
    evidenceFiles.find(({ kind }) => kind === 'LINK').url,
    'https://example.com/evidence',
  );
  assert.equal(detail.revisions[0].id, revision.id);
  assert.equal(detail.revisions[0].requestContent, '보완 요청 이력');
  for (const [item, mime, filename, bytes] of [
    [
      evidenceFiles.find(({ kind }) => kind === 'FILE'),
      'image/png',
      'evidence.png',
      png,
    ],
    [
      detail.revisions[0].evidence.attachments[0],
      'application/pdf',
      'evidence.pdf',
      pdf,
    ],
  ]) {
    assert.equal(item.downloadPath, '/api' + downloadPath(item.id));
    assert.equal('objectKey' in item, false);
    const response = await request(downloadPath(item.id), admin.token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), mime);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert(
      response.headers
        .get('content-disposition')
        .endsWith("filename*=UTF-8''" + filename),
    );
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    checks++;
  }
  for (const attachmentId of [
    current.unsaved.id,
    current.link.id,
    previous.unsaved.id,
    unrelated.saved.id,
    foreign.saved.id,
    randomUUID(),
  ]) {
    await json(downloadPath(attachmentId), admin.token, {
      status: 404,
      code: 'FILE_NOT_FOUND',
    });
  }
  await json(downloadPath('not-a-uuid'), admin.token, {
    status: 400,
    code: 'BAD_REQUEST',
  });
  await prisma.attachment.update({
    where: { id: previous.saved.id },
    data: { saved: false },
  });
  await json(downloadPath(previous.saved.id), admin.token, {
    status: 404,
    code: 'FILE_NOT_FOUND',
  });
  // 사용자 다운로드는 기존 동작대로 자기 묶음의 업로드 완료 파일을 제공한다.
  const ownerPath =
    filesRoute +
    '/' +
    current.id +
    '/attachments/' +
    current.unsaved.id +
    '/content';
  const ownerFile = await request(ownerPath, owner.token);
  assert.equal(ownerFile.status, 200);
  assert.deepEqual(Buffer.from(await ownerFile.arrayBuffer()), png);
  checks++;
  await json(ownerPath, other.token, { status: 404, code: 'FILE_NOT_FOUND' });

  assert.deepEqual(
    await prisma.listingApplication.findUnique({ where: { id: submitted.id } }),
    submitted,
  );
  const submittedDetail = await json(
    route + '/' + newSubmission.id,
    admin.token,
  );
  assert.equal(submittedDetail.status, 'SUBMITTED');
  assert.deepEqual(
    await prisma.listingApplication.findUnique({
      where: { id: newSubmission.id },
    }),
    newSubmission,
  );
  assert.equal(await prisma.adminActivityLog.count(), 0);
  const swagger = await (await fetch(base + '/docs-json')).json();
  const parameters = swagger.paths['/api' + route].get.parameters;
  for (const name of ['sectorCode', 'page', 'size']) {
    assert.equal(
      parameters.find((parameter) => parameter.name === name)?.schema.type,
      'number',
    );
  }
  assert.equal(
    parameters.find((parameter) => parameter.name === 'applicant')?.schema.type,
    'string',
  );
  const adminPaths = Object.entries(swagger.paths).filter(([path]) =>
    path.startsWith('/api' + route),
  );
  const readPaths = adminPaths.filter(([, operations]) => operations.get);
  assert.equal(readPaths.length, 3);
  assert(
    readPaths.every(
      ([, operations]) =>
        operations.get?.security && !operations.post && !operations.patch,
    ),
  );
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
      if (createdDatabase)
        await adminDb.query('DROP DATABASE "' + dbName + '"');
    } finally {
      await adminDb.end();
      assert.equal(dirname(uploads), tempRoot);
      assert(basename(uploads).startsWith('motu-admin-listing-'));
      await rm(uploads, { recursive: true, force: true });
    }
  }
}
