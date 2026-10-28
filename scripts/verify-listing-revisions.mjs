// npm run build 후 실행. localhost의 일회용 DB·저장소만 사용하고 finally에서 정리한다.
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import pg from 'pg';
import argon2 from 'argon2';

const originalUrl = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(originalUrl.hostname),
  '로컬 DB만 허용합니다.',
);
const databaseName = `motu_revisions_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const testUrl = new URL(originalUrl);
testUrl.pathname = `/${databaseName}`;
const root = new pg.Client({ connectionString: originalUrl.toString() });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
let app;
let client;
let createdDatabase = false;
let storageDirectory;
let base;
let prisma;
let checks = 0;
const check = (condition, message) => {
  assert(condition, message);
  checks++;
};
const userRoute = (id) => `/listing-applications/${id}/revision-requests`;
const adminRoute = (id) =>
  `/admin/listing-applications/${id}/revision-requests`;
async function raw(path, token, method = 'GET', body) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || multipart
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined || multipart ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function call(path, token, method = 'GET', body, status = 200, code) {
  const result = await raw(path, token, method, body);
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code)
    assert.equal(result.body.error?.code, code, JSON.stringify(result.body));
  checks++;
  return status < 400 ? result.body.data : result.body.error;
}
function form() {
  const body = new FormData();
  body.append('files', new Blob([png], { type: 'image/png' }), 'proof.png');
  return body;
}

try {
  await root.connect();
  await root.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  storageDirectory = await mkdtemp(join(tmpdir(), 'motu-revision-files-'));
  Object.assign(process.env, {
    DATABASE_URL: testUrl.toString(),
    NODE_ENV: 'test',
    BREVO_API_KEY: '',
    FILE_STORAGE_DRIVER: 'local',
    FILE_LOCAL_DIRECTORY: storageDirectory,
  });
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
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  setupSwagger(app);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  prisma = app.get(PrismaService);
  client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  await setTimeout(100);
  const password = 'RevisionTest1!';
  const hash = await argon2.hash(password);
  const users = [];
  for (const [index, role] of ['ADMIN', 'USER', 'USER'].entries()) {
    const user = await prisma.user.create({
      data: {
        loginId: `revision${index}`,
        password: hash,
        email: `revision${index}@motu.test`,
        nickname: `보완검증${index}`,
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        role,
      },
    });
    const login = await call('/auth/login', null, 'POST', {
      loginId: user.loginId,
      password,
    });
    users.push({ ...user, token: login.accessToken });
  }
  const [admin, owner, other] = users;
  const demoRun = await promisify(execFile)(
    process.execPath,
    ['scripts/prepare-listing-revision-demo.mjs', owner.loginId],
    { env: process.env, timeout: 10000 },
  );
  const demo = JSON.parse(demoRun.stdout.trim());
  check(
    demo.localOnly &&
      demo.status === 'REVISION_REQUESTED' &&
      Number.isInteger(demo.revisionId),
    '사용자 Swagger 보완 요청 fixture 준비',
  );
  const application = await prisma.listingApplication.findUniqueOrThrow({
    where: { id: demo.applicationId },
  });
  const initialData = application.draftData;
  const submittedAt = application.submittedAt;
  const request = {
    requestContent: application.reviewComment,
    deadline: demo.deadline,
  };
  const revisionId = demo.revisionId;
  const submitPath = `${userRoute(application.id)}/${revisionId}/resubmit`;
  await call(userRoute(application.id), null, 'GET', undefined, 401);
  await call(
    submitPath,
    null,
    'POST',
    { evidenceCollectionId: randomUUID() },
    401,
  );
  // 관리자 생성·조회·기한 연장 경로는 관리자 토큰을 보내도 존재하지 않는다.
  for (const token of [admin.token, owner.token]) {
    await call(
      adminRoute(application.id),
      token,
      'GET',
      undefined,
      404,
      'NOT_FOUND',
    );
    await call(
      adminRoute(application.id),
      token,
      'POST',
      request,
      404,
      'NOT_FOUND',
    );
    await call(
      `${adminRoute(application.id)}/${revisionId}/deadline`,
      token,
      'PATCH',
      { deadline: request.deadline },
      404,
      'NOT_FOUND',
    );
  }
  await call(
    userRoute(application.id),
    owner.token,
    'POST',
    request,
    404,
    'NOT_FOUND',
  );
  await call(
    `${userRoute(application.id)}/${revisionId}/deadline`,
    owner.token,
    'PATCH',
    { deadline: request.deadline },
    404,
    'NOT_FOUND',
  );
  await call(
    userRoute(application.id),
    other.token,
    'GET',
    undefined,
    404,
    'LISTING_REVISION_NOT_FOUND',
  );
  await call(
    userRoute(application.id),
    admin.token,
    'GET',
    undefined,
    404,
    'LISTING_REVISION_NOT_FOUND',
  );
  await call(
    userRoute(2147483648),
    owner.token,
    'GET',
    undefined,
    404,
    'LISTING_REVISION_NOT_FOUND',
  );
  const listing = await call(userRoute(application.id), owner.token);
  check(
    listing.items[0].canResubmit &&
      listing.items[0].id === revisionId &&
      listing.applicationNumber === application.applicationNumber,
    '본인 보완 내용·기한·기존 신청번호 조회',
  );
  const invalid = await call(
    userRoute(application.id) + '?size=51',
    owner.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  check(
    invalid.details.every((value) =>
      value.includes('요청 값이 올바르지 않습니다.'),
    ),
    '사용자 요청 검증 한글',
  );
  await call(
    userRoute(application.id) + '?userId=' + other.id,
    owner.token,
    'GET',
    undefined,
    400,
    'BAD_REQUEST',
  );
  const state = await call(
    `/listing-applications/${application.id}/status`,
    owner.token,
  );
  check(
    state.status === 'REVISION_REQUESTED' &&
      state.reviewComment === request.requestContent &&
      state.revisionDeadline === request.deadline,
    '기존 상태 API에서 준비된 보완 내용 표시',
  );
  await call(
    submitPath,
    owner.token,
    'POST',
    { evidenceCollectionId: 'invalid' },
    400,
    'BAD_REQUEST',
  );
  await call(
    submitPath,
    owner.token,
    'POST',
    {
      evidenceCollectionId: randomUUID(),
      status: 'UNDER_REVIEW',
      deadline: '2099-01-01T00:00:00Z',
    },
    400,
    'BAD_REQUEST',
  );
  const collection = await call(
    '/files/collections',
    owner.token,
    'POST',
    { purpose: 'EVIDENCE' },
    201,
  );
  const fileRoute = `/files/collections/${collection.id}`;
  const link = await call(
    fileRoute + '/links',
    owner.token,
    'POST',
    { url: 'https://example.com/revision' },
    201,
  );
  const upload = await call(
    fileRoute + '/uploads',
    owner.token,
    'POST',
    form(),
    201,
  );
  const evidenceBody = { evidenceCollectionId: collection.id };
  await call(
    submitPath,
    owner.token,
    'POST',
    evidenceBody,
    400,
    'LISTING_REVISION_INVALID_EVIDENCE',
  );
  await call(
    submitPath,
    other.token,
    'POST',
    evidenceBody,
    404,
    'LISTING_REVISION_NOT_FOUND',
  );
  await call(fileRoute, owner.token, 'PUT', {
    attachmentIds: [],
    description: '집계 근거 자료를 보완했습니다.',
  });
  await call(
    submitPath,
    owner.token,
    'POST',
    evidenceBody,
    400,
    'LISTING_REVISION_INVALID_EVIDENCE',
  );
  await call(fileRoute, owner.token, 'PUT', {
    attachmentIds: [link.id, upload[0].id],
    description: '짧음',
  });
  await call(
    submitPath,
    owner.token,
    'POST',
    evidenceBody,
    400,
    'LISTING_REVISION_INVALID_EVIDENCE',
  );
  await call(fileRoute, owner.token, 'PUT', {
    attachmentIds: [link.id, upload[0].id],
    description: '집계 근거 자료를 보완했습니다.',
    validateStep: true,
  });
  const foreign = await call(
    '/files/collections',
    other.token,
    'POST',
    { purpose: 'EVIDENCE' },
    201,
  );
  await call(
    submitPath,
    owner.token,
    'POST',
    { evidenceCollectionId: foreign.id },
    400,
    'LISTING_REVISION_INVALID_EVIDENCE',
  );
  const image = await call(
    '/files/collections',
    owner.token,
    'POST',
    { purpose: 'MAIN_IMAGE' },
    201,
  );
  await call(
    submitPath,
    owner.token,
    'POST',
    { evidenceCollectionId: image.id },
    400,
    'LISTING_REVISION_INVALID_EVIDENCE',
  );
  check(
    (
      await prisma.listingApplication.findUniqueOrThrow({
        where: { id: application.id },
      })
    ).status === 'REVISION_REQUESTED',
    '검증 실패 시 상태 유지',
  );

  const expiredRun = await promisify(execFile)(
    process.execPath,
    ['scripts/prepare-listing-revision-demo.mjs', owner.loginId, '--expired'],
    { env: process.env, timeout: 10000 },
  );
  const expiredDemo = JSON.parse(expiredRun.stdout.trim());
  check(
    expiredDemo.isDeadlinePassed && expiredDemo.status === 'REVISION_REQUESTED',
    '기한 경과 fixture 준비',
  );
  await call(
    `${userRoute(expiredDemo.applicationId)}/${expiredDemo.revisionId}/resubmit`,
    owner.token,
    'POST',
    evidenceBody,
    410,
    'LISTING_REVISION_DEADLINE_PASSED',
  );
  const overdue = await call(userRoute(expiredDemo.applicationId), owner.token);
  check(
    overdue.status === 'REVISION_REQUESTED' &&
      overdue.items[0].isDeadlinePassed &&
      !overdue.items[0].canResubmit,
    '기한 경과 시 차단·상태 유지',
  );
  // 상태 변경을 DB에서 실패시켜 그 전에 수행한 증빙 동결·회차 갱신도 함께 롤백되는지 검사한다.
  await client.query(
    `ALTER TABLE listing_applications ADD CONSTRAINT integration_block_state_change CHECK (application_id <> ${application.id} OR status <> 'UNDER_REVIEW')`,
  );
  await call(submitPath, owner.token, 'POST', evidenceBody, 500);
  check(
    !(
      await prisma.attachmentCollection.findUniqueOrThrow({
        where: { id: collection.id },
      })
    ).frozenAt,
    '실패 시 첨부 동결 롤백',
  );
  check(
    !(
      await prisma.listingApplicationRevision.findUniqueOrThrow({
        where: { id: revisionId },
      })
    ).resubmittedAt,
    '실패 시 제출 이력 롤백',
  );
  await client.query(
    'ALTER TABLE listing_applications DROP CONSTRAINT integration_block_state_change',
  );
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      call(submitPath, owner.token, 'POST', evidenceBody),
    ),
  );
  check(
    results.every(
      (result) =>
        result.status === 'UNDER_REVIEW' &&
        result.revision.resubmittedAt === results[0].revision.resubmittedAt,
    ),
    '동시 재제출은 한 번 반영하고 같은 결과 반환',
  );
  const completedHistory = await call(userRoute(application.id), owner.token);
  check(
    completedHistory.status === 'UNDER_REVIEW' &&
      completedHistory.totalCount === 1 &&
      completedHistory.items[0].requestContent === request.requestContent &&
      completedHistory.items[0].deadline === request.deadline &&
      completedHistory.items[0].resubmittedAt ===
        results[0].revision.resubmittedAt &&
      completedHistory.items[0].evidence.attachments.length === 2 &&
      !completedHistory.items[0].canResubmit,
    '사용자 조회에서 보완 내용·기한·제출시각·증빙 이력 유지',
  );
  const repeated = await call(submitPath, owner.token, 'POST', evidenceBody);
  const repeatedHistory = await call(userRoute(application.id), owner.token);
  check(
    repeated.revision.resubmittedAt === results[0].revision.resubmittedAt &&
      repeated.applicationNumber === application.applicationNumber &&
      repeatedHistory.totalCount === completedHistory.totalCount,
    '같은 요청 재실행 후 최초 제출시각·신청번호·이력 수 유지',
  );
  const updated = await prisma.listingApplication.findUniqueOrThrow({
    where: { id: application.id },
  });
  check(
    updated.applicationNumber === application.applicationNumber &&
      updated.submittedAt.getTime() === submittedAt.getTime() &&
      updated.draftData.desiredPrice === initialData.desiredPrice &&
      updated.draftData.evidenceCollectionId === collection.id &&
      updated.revisionDeadline === null,
    '번호·최초 접수일·기존 필드 유지 및 증빙 연결',
  );
  check(
    results[0].revision.evidence.attachments.length === 2 &&
      results[0].revision.evidence.attachments.every((item) => item.saved),
    '저장 완료 증빙만 스냅샷',
  );
  const stored = await prisma.listingApplicationRevision.findUniqueOrThrow({
    where: { id: revisionId },
  });
  check(
    stored.previousData.desiredPrice === '10000',
    '보완 이전 신청 데이터 보존',
  );
  await call(
    fileRoute + '/links',
    owner.token,
    'POST',
    { url: 'https://example.com/change' },
    409,
    'FILE_COLLECTION_FROZEN',
  );
  await call(
    fileRoute,
    owner.token,
    'PUT',
    { attachmentIds: [], description: '내용 바꾸기 시도' },
    409,
    'FILE_COLLECTION_FROZEN',
  );
  await call(
    fileRoute + `/attachments/${link.id}`,
    owner.token,
    'DELETE',
    undefined,
    409,
    'FILE_COLLECTION_FROZEN',
  );
  await call(
    fileRoute + `/attachments/${upload[0].id}`,
    owner.token,
    'DELETE',
    undefined,
    409,
    'FILE_COLLECTION_FROZEN',
  );
  await call(
    fileRoute + '/uploads',
    owner.token,
    'POST',
    form(),
    409,
    'FILE_COLLECTION_FROZEN',
  );
  const frozenCollection = await call(fileRoute, owner.token);
  check(
    frozenCollection.description === '집계 근거 자료를 보완했습니다.' &&
      frozenCollection.attachments.length === 2 &&
      frozenCollection.attachments.every((item) => item.saved) &&
      frozenCollection.attachments.some((item) => item.id === link.id) &&
      frozenCollection.attachments.some((item) => item.id === upload[0].id),
    '동결 후 조회와 삭제 차단 후에도 파일·링크·설명 보존',
  );
  const download = await fetch(
    base + upload[0].downloadPath.replace('/api', ''),
    { headers: { Authorization: `Bearer ${owner.token}` } },
  );
  check(
    download.status === 200 &&
      Buffer.from(await download.arrayBuffer()).equals(png),
    '동결 후에도 파일 다운로드·원본 바이트 유지',
  );
  await call(
    submitPath,
    owner.token,
    'POST',
    { evidenceCollectionId: image.id },
    409,
    'LISTING_REVISION_ALREADY_SUBMITTED',
  );
  // 후속 관리자 모듈이 제공할 다음 회차를 일회용 테스트 DB에만 준비한다.
  const second = await prisma.$transaction(async (tx) => {
    const revision = await tx.listingApplicationRevision.create({
      data: {
        applicationId: application.id,
        requestedById: admin.id,
        requestContent: '두 번째 증빙자료를 보완해 주세요.',
        deadline: new Date(Date.now() + 7 * 86400000),
        previousData: updated.draftData,
      },
    });
    await tx.listingApplication.update({
      where: { id: application.id },
      data: {
        status: 'REVISION_REQUESTED',
        reviewComment: revision.requestContent,
        revisionDeadline: revision.deadline,
      },
    });
    return { revision };
  });
  const replay = await call(submitPath, owner.token, 'POST', evidenceBody);
  check(
    replay.status === 'REVISION_REQUESTED',
    '과거 재전송이 새 보완 요청 상태를 덮어쓰지 않음',
  );
  const history = await call(
    userRoute(application.id) + '?page=1&size=1',
    owner.token,
  );
  check(
    history.totalCount === 2 &&
      history.items.length === 1 &&
      history.items[0].id === second.revision.id,
    '여러 회차 최신순 페이지 조회',
  );
  const previous = await call(
    userRoute(application.id) + '?page=2&size=1',
    owner.token,
  );
  check(
    previous.items[0].id === revisionId &&
      previous.items[0].evidence.attachments.length === 2,
    '지난 회차 증빙 이력 유지',
  );
  // 파일 잠금 대기 중 기한이 지나면 상태와 첨부 동결을 반영하지 않는다.
  const newer = await call(
    '/files/collections',
    owner.token,
    'POST',
    { purpose: 'EVIDENCE' },
    201,
  );
  const newerLink = await call(
    `/files/collections/${newer.id}/links`,
    owner.token,
    'POST',
    { url: 'https://example.com/newer' },
    201,
  );
  await call(`/files/collections/${newer.id}`, owner.token, 'PUT', {
    attachmentIds: [newerLink.id],
    description: '두 번째 근거 자료를 보완했습니다.',
  });
  const nearDeadline = new Date(Date.now() + 1500);
  await prisma.listingApplicationRevision.update({
    where: { id: second.revision.id },
    data: { deadline: nearDeadline },
  });
  await client.query('BEGIN');
  await client.query(
    'SELECT id FROM attachment_collections WHERE id=$1 FOR UPDATE',
    [newer.id],
  );
  const delayed = raw(
    `${userRoute(application.id)}/${second.revision.id}/resubmit`,
    owner.token,
    'POST',
    { evidenceCollectionId: newer.id },
  );
  let waiting = false;
  for (let index = 0; index < 100; index++) {
    const locks = await root.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%attachment_collections%'",
      [databaseName],
    );
    if (locks.rows[0].n) {
      waiting = true;
      break;
    }
    await setTimeout(10);
  }
  await setTimeout(Math.max(0, nearDeadline.getTime() - Date.now() + 50));
  await client.query('COMMIT');
  const delayedResult = await delayed;
  check(
    waiting &&
      delayedResult.status === 410 &&
      delayedResult.body.error.code === 'LISTING_REVISION_DEADLINE_PASSED',
    '실제 파일 잠금 대기 중 기한 경과 차단',
  );
  check(
    !(
      await prisma.attachmentCollection.findUniqueOrThrow({
        where: { id: newer.id },
      })
    ).frozenAt,
    '기한 경과 시 새 묶음 변경 가능 상태 유지',
  );
  const schema = await fetch(base + '/docs-json').then((response) =>
    response.json(),
  );
  const paths = schema.paths;
  const ownerListPath =
    '/api/listing-applications/{applicationId}/revision-requests';
  const ownerSubmitPath = ownerListPath + '/{revisionId}/resubmit';
  check(
    paths[ownerListPath]?.get && paths[ownerSubmitPath]?.post,
    'Swagger에 사용자 보완 조회·재제출 API 등록',
  );
  check(
    !Object.keys(paths).some((path) =>
      path.startsWith('/api/admin/listing-applications/'),
    ) &&
      !paths[ownerListPath].post &&
      !paths[ownerListPath + '/{revisionId}/deadline'],
    'Swagger에 관리자 생성·조회·기한 연장 경로 없음',
  );
  check(
    !schema.components.schemas.CreateListingRevisionReqDto &&
      !schema.components.schemas.ExtendListingRevisionDeadlineReqDto,
    '관리자 요청 DTO가 공개 문서에 남지 않음',
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      checks,
      isolatedDatabase: true,
      productionChanged: false,
    }),
  );
} finally {
  if (client) {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  if (app) await app.close();
  if (createdDatabase) await root.query(`DROP DATABASE "${databaseName}"`);
  await root.end();
  if (storageDirectory) {
    const resolved = resolve(storageDirectory);
    const parent = resolve(tmpdir());
    const child = relative(parent, resolved);
    assert(
      child &&
        !child.startsWith('..') &&
        !isAbsolute(child) &&
        resolved.split(/[\\/]/).at(-1).startsWith('motu-revision-files-'),
      '임시 저장소 경로 확인 실패',
    );
    await rm(resolved, { recursive: true, force: true });
  }
}
