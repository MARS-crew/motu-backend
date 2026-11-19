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
  'motu_admin_review_' + randomUUID().replaceAll('-', '').slice(0, 12);
const adminDb = new pg.Client({ connectionString: dbUrl.toString() });
dbUrl.pathname = '/' + dbName;
const tempRoot = resolve(tmpdir());
const uploads = await mkdtemp(join(tempRoot, 'motu-admin-review-'));
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
  const { ListingActivationService } =
    await import('../dist/modules/listing-applications/listing-activation.service.js');
  const { StockTradingService } =
    await import('../dist/modules/matching/stock-trading.service.js');
  const { MatchingService } =
    await import('../dist/modules/matching/matching.service.js');
  const { AdminActivityLogsService } =
    await import('../dist/modules/admin-activity-logs/admin-activity-logs.service.js');
  const activation = app.get(ListingActivationService);
  // 자동 주기 작업의 간섭을 막고 예약 처리를 직접 호출한다.
  activation.onModuleDestroy();
  await prisma.account.create({ data: { userId: owner.id, cash: 0n } });
  await prisma.account.create({ data: { userId: other.id, cash: 1000000n } });
  const image = async (purpose) => {
    const { id } = await json(filesRoute, owner.token, {
      method: 'POST',
      status: 201,
      body: { purpose },
    });
    const form = new FormData();
    form.append('files', new Blob([png], { type: 'image/png' }), 'public.png');
    const [attachment] = await json(
      filesRoute + '/' + id + '/uploads',
      owner.token,
      { method: 'POST', status: 201, body: form },
    );
    await json(filesRoute + '/' + id, owner.token, {
      method: 'PUT',
      body: { attachmentIds: [attachment.id] },
    });
    return { id, attachment };
  };
  const main = await image('MAIN_IMAGE');
  const logo = await image('LOGO');
  const evidence = await createEvidence(owner.token, { withLink: true });
  // 수동 Swagger 준비 스크립트도 실제 저장 자료와 일회용 DB에서 검증한다.
  const demoOutput = await promisify(execFile)(
    process.execPath,
    [
      'scripts/prepare-admin-listing-review-demo.mjs',
      '--login-id',
      'ownerlist',
      '--main-image',
      main.id,
      '--evidence',
      evidence.id,
    ],
    { timeout: 30000 },
  );
  const demo = JSON.parse(demoOutput.stdout);
  assert.equal(demo.localOnly, true);
  assert.equal(Object.keys(demo.applications).length, 3);
  const demoIds = Object.values(demo.applications).map(
    (item) => item.applicationId,
  );
  assert.equal(
    await prisma.listingApplication.count({
      where: { id: { in: demoIds }, userId: owner.id, status: 'SUBMITTED' },
    }),
    3,
  );
  const demoData = await prisma.listingApplication.findUnique({
    where: { id: demo.applications.A.applicationId },
  });
  assert.equal(demoData.draftData.mainImageCollectionId, main.id);
  assert.equal(demoData.draftData.evidenceCollectionId, evidence.id);
  assert.equal(demoData.draftData.desiredPrice, '10000');
  const draftData = {
    serviceName: '심사 검증 서비스',
    summary: '관리자 상장 심사 통합 검증 서비스입니다.',
    description: '상세 설명',
    sectorCode: 1,
    officialUrl: 'https://example.com',
    operatorName: '테스트 운영사',
    managerName: '테스트 담당자',
    businessEmail: 'review@motu.test',
    contactPhone: '01012345678',
    mainImageCollectionId: main.id,
    logoCollectionId: logo.id,
    desiredPrice: '10000',
    totalIssuedQuantity: '1000',
    priceCalculationBasis: '심사 검증을 위한 가격 산정 근거입니다.',
    minOrderQuantity: '1',
    tickSize: '10',
    evidenceCollectionId: evidence.id,
    evidenceDescription: evidence.collection.description,
    mau: null,
    dau: null,
    revenue: null,
    transactionVolume: null,
  };
  let seq = 0;
  const listing = (extra = {}) =>
    prisma.listingApplication.create({
      data: {
        userId: owner.id,
        applicationNumber: 'LST-REVIEW-' + ++seq,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        serviceName: draftData.serviceName,
        expiresAt: new Date('2099-01-01'),
        draftData,
        ...extra,
      },
    });
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
  }).format(new Date());
  const future = (days = 1) =>
    new Date(Date.now() + days * 86400000).toISOString();
  const approval = {
    finalPrice: '10000',
    totalIssuedQuantity: '1000',
    listingDate: today,
    tradingStartAt: future(),
    reason: '신청 정보와 증빙자료 검토 완료',
  };
  const revisionBody = {
    requestItems: ['증빙자료', '서비스 지표 근거'],
    requestContent: '최신 자료로 보완해 주세요.',
    deadline: future(),
  };
  const post = (id, operation, body, options = {}) =>
    json(`${route}/${id}/${operation}`, admin.token, {
      method: 'POST',
      body,
      ...options,
    });
  const one = await listing();
  const state = await json(`${route}/${one.id}`, admin.token);
  assert.equal(state.status, 'SUBMITTED');
  for (const [operation, body] of [
    ['start-review', undefined],
    ['revision-requests', revisionBody],
    [
      'revision-requests/1/extend-deadline',
      { deadline: future(2), reason: '연장' },
    ],
    ['reject', { reason: '반려' }],
    ['approve', approval],
  ]) {
    for (const [token, status] of [
      [null, 401],
      [owner.token, 403],
    ]) {
      await json(`${route}/${one.id}/${operation}`, token, {
        method: 'POST',
        body,
        status,
      });
    }
  }
  await post(one.id, 'approve', approval, {
    status: 409,
    code: 'LISTING_REVIEW_INVALID_STATE',
  });
  const startResults = await Promise.all([
    request(`${route}/${one.id}/start-review`, admin.token, 'POST'),
    request(`${route}/${one.id}/start-review`, admin.token, 'POST'),
  ]);
  assert.deepEqual(startResults.map((r) => r.status).sort(), [200, 409]);
  checks += 2;
  assert.equal(
    await prisma.adminActivityLog.count({
      where: { targetId: BigInt(one.id), action: 'LISTING_REVIEW_START' },
    }),
    1,
  );
  await post(one.id, 'start-review', undefined, { status: 409 });
  await post(2147483647, 'start-review', undefined, { status: 404 });
  for (const status of [
    'DRAFT',
    'EXPIRED',
    'APPROVED',
    'REJECTED',
    'REVISION_REQUESTED',
  ]) {
    const item = await listing({ status });
    await post(item.id, 'start-review', undefined, { status: 409 });
  }
  await post(
    one.id,
    'revision-requests',
    { ...revisionBody, requestItems: [] },
    { status: 400 },
  );
  await post(
    one.id,
    'revision-requests',
    { ...revisionBody, requestItems: ['  '] },
    { status: 400 },
  );
  await post(
    one.id,
    'revision-requests',
    { ...revisionBody, deadline: new Date(Date.now() - 1000).toISOString() },
    { status: 400, code: 'LISTING_REVIEW_INVALID_DEADLINE' },
  );
  const rev = await post(one.id, 'revision-requests', revisionBody);
  assert.equal(rev.status, 'REVISION_REQUESTED');
  await post(one.id, 'revision-requests', revisionBody, { status: 409 });
  const detail = await json(`${route}/${one.id}`, admin.token);
  assert.deepEqual(detail.revisions[0].requestItems, revisionBody.requestItems);
  assert.equal(detail.revisions[0].previousEvidence.id, evidence.id);
  const historyRoute = `/listing-applications/${one.id}/revision-requests`;
  const userHistory = await json(historyRoute, owner.token);
  assert.equal(userHistory.totalCount, 1);
  assert.equal(userHistory.items[0].canResubmit, true);
  assert.equal(userHistory.items[0].deadlineHistory.length, 1);
  await json(historyRoute, other.token, { status: 404 });
  await json(`${historyRoute}/${rev.revisionId}/resubmit`, other.token, {
    method: 'POST',
    body: { evidenceCollectionId: evidence.id },
    status: 404,
  });
  await json(
    `${filesRoute}/${evidence.id}/attachments/${evidence.saved.id}`,
    owner.token,
    { method: 'DELETE', status: 409, code: 'FILE_COLLECTION_FROZEN' },
  );
  const expired = new Date(Date.now() - 1000);
  await prisma.listingApplicationRevision.update({
    where: { id: rev.revisionId },
    data: { deadline: expired },
  });
  await prisma.listingApplication.update({
    where: { id: one.id },
    data: { revisionDeadline: expired },
  });
  await json(`${historyRoute}/${rev.revisionId}/resubmit`, owner.token, {
    method: 'POST',
    body: { evidenceCollectionId: evidence.id },
    status: 410,
    code: 'LISTING_REVISION_DEADLINE_PASSED',
  });
  assert.equal(
    (await prisma.listingApplication.findUnique({ where: { id: one.id } }))
      .status,
    'REVISION_REQUESTED',
  );
  await post(one.id, `revision-requests/${rev.revisionId}/extend-deadline`, {
    deadline: future(2),
    reason: '보완 자료 준비 기간 연장',
  });
  await post(
    one.id,
    `revision-requests/${rev.revisionId}/extend-deadline`,
    { deadline: future(), reason: '짧은 기한' },
    { status: 400 },
  );
  await post(
    one.id,
    'revision-requests/2147483647/extend-deadline',
    { deadline: future(3), reason: '다른 회차' },
    { status: 409 },
  );
  const replacement = await createEvidence(owner.token);
  const resubmitted = await json(
    `${historyRoute}/${rev.revisionId}/resubmit`,
    owner.token,
    { method: 'POST', body: { evidenceCollectionId: replacement.id } },
  );
  assert.equal(resubmitted.status, 'UNDER_REVIEW');
  assert.equal(resubmitted.applicationNumber, one.applicationNumber);
  const retried = await json(
    `${historyRoute}/${rev.revisionId}/resubmit`,
    owner.token,
    { method: 'POST', body: { evidenceCollectionId: replacement.id } },
  );
  assert.equal(
    retried.revision.resubmittedAt,
    resubmitted.revision.resubmittedAt,
  );
  await post(
    one.id,
    `revision-requests/${rev.revisionId}/extend-deadline`,
    { deadline: future(3), reason: '제출 후 연장' },
    { status: 409 },
  );
  const historyAfter = await json(`${route}/${one.id}`, admin.token);
  assert.equal(historyAfter.revisions[0].previousEvidence.id, evidence.id);
  assert.equal(historyAfter.revisions[0].evidence.id, replacement.id);
  assert.equal(historyAfter.revisions[0].deadlineHistory.length, 2);
  // 두 번째 보완은 새 회차이며 이미 동결된 이미지도 그대로 보존한다.
  const second = await post(one.id, 'revision-requests', {
    ...revisionBody,
    requestContent: '추가 근거가 필요합니다.',
  });
  assert.notEqual(second.revisionId, rev.revisionId);
  const nextEvidence = await createEvidence(owner.token);
  await json(`${historyRoute}/${second.revisionId}/resubmit`, owner.token, {
    method: 'POST',
    body: { evidenceCollectionId: nextEvidence.id },
  });
  assert.equal((await json(historyRoute, owner.token)).totalCount, 2);
  assert.equal(
    (
      await prisma.listingApplication.findUnique({ where: { id: one.id } })
    ).submittedAt.toISOString(),
    one.submittedAt.toISOString(),
  );
  // 거절 처리와 이유 보존, 중복·최종상태 덮어쓰기 차단.
  const rejected = await listing({ status: 'UNDER_REVIEW' });
  await post(rejected.id, 'reject', { reason: '   ' }, { status: 400 });
  assert.equal(
    (await post(rejected.id, 'reject', { reason: '사업 근거 불충분' })).status,
    'REJECTED',
  );
  assert.equal(
    (await json(`/listing-applications/${rejected.id}`, owner.token))
      .reviewComment,
    '사업 근거 불충분',
  );
  await post(rejected.id, 'reject', { reason: '중복' }, { status: 409 });
  await post(rejected.id, 'approve', approval, { status: 409 });
  assert.equal(await prisma.stock.count(), 0);
  for (const patch of [
    { finalPrice: '0' },
    { totalIssuedQuantity: '0' },
    { finalPrice: '9007199254740992' },
    { finalPrice: '9007199254740991', totalIssuedQuantity: '9007199254740991' },
    { finalPrice: '11000' },
    { listingDate: '2026-02-30' },
    { listingDate: '2000-01-01' },
    { listingDate: future(3).slice(0, 10) },
    { tradingStartAt: '2099-01-01T09:00:00' },
    { tradingStartAt: new Date(Date.now() - 1000).toISOString() },
    { finalPrice: '10001', priceAdjustmentReason: '가격 변경' },
  ]) {
    await post(one.id, 'approve', { ...approval, ...patch }, { status: 400 });
  }
  assert.equal(await prisma.stock.count(), 0);
  const incomplete = await listing({ status: 'UNDER_REVIEW', draftData: {} });
  await post(incomplete.id, 'approve', approval, {
    status: 400,
    code: 'LISTING_REVIEW_INCOMPLETE_APPLICATION',
  });
  const badMetrics = await listing({
    status: 'UNDER_REVIEW',
    draftData: { ...draftData, mau: '9999999999999999999999' },
  });
  await post(badMetrics.id, 'approve', approval, {
    status: 400,
    code: 'LISTING_REVIEW_INCOMPLETE_APPLICATION',
  });
  const foreignEvidence = await createEvidence(other.token);
  const foreignApp = await listing({
    status: 'UNDER_REVIEW',
    draftData: { ...draftData, evidenceCollectionId: foreignEvidence.id },
  });
  await post(foreignApp.id, 'approve', approval, {
    status: 400,
    code: 'LISTING_REVIEW_INCOMPLETE_APPLICATION',
  });
  const noAccountUser = await createAccount('noaccount', 'USER');
  const noAccount = await listing({
    userId: noAccountUser.id,
    status: 'UNDER_REVIEW',
  });
  await post(noAccount.id, 'approve', approval, {
    status: 409,
    code: 'LISTING_REVIEW_ISSUER_ACCOUNT_REQUIRED',
  });
  // 심사/상품 생성 후 활동 이력이 실패하면 모든 DB 변경을 롤백한다.
  const logService = app.get(AdminActivityLogsService);
  const originalRecord = logService.record.bind(logService);
  const failRecord = async () => {
    throw new Error('audit rollback test');
  };
  const rollback = await listing({ status: 'UNDER_REVIEW' });
  logService.record = failRecord;
  try {
    await post(rollback.id, 'approve', approval, { status: 500 });
  } finally {
    logService.record = originalRecord;
  }
  assert.equal(await prisma.stock.count(), 0);
  assert.equal(
    (await prisma.listingApplication.findUnique({ where: { id: rollback.id } }))
      .status,
    'UNDER_REVIEW',
  );
  // 두 관리자가 같은 신청서를 승인해도 상품과 활동 이력은 각 하나다.
  const changedApproval = {
    ...approval,
    finalPrice: '11000',
    priceAdjustmentReason: '산정 근거 재검토 결과 조정',
  };
  const approvedResponses = await Promise.all([
    request(`${route}/${one.id}/approve`, admin.token, 'POST', changedApproval),
    request(`${route}/${one.id}/approve`, admin.token, 'POST', changedApproval),
  ]);
  assert.deepEqual(approvedResponses.map((r) => r.status).sort(), [200, 409]);
  checks += 2;
  const approvedResponse = approvedResponses.find((r) => r.status === 200);
  const approved = (await approvedResponse.json()).data;
  const stock = await prisma.stock.findUnique({
    where: { id: approved.stockId },
  });
  assert.equal(stock.tradeStatus, 'PENDING');
  assert.equal(stock.basePrice, 11000n);
  assert.equal(stock.listedShares, 1000n);
  assert.equal(stock.minOrderPrice, 10n);
  assert.equal(stock.priceTickSize, 10n);
  assert.equal(stock.minOrderQty, 1n);
  assert.equal(stock.approvedListingDate.toISOString().slice(0, 10), today);
  assert.equal(stock.listingDate.toISOString(), approval.tradingStartAt);
  assert.equal(stock.mau, null);
  assert.equal(await prisma.stock.count(), 1);
  assert.equal(await prisma.holding.count({ where: { stockId: stock.id } }), 0);
  assert.equal(await prisma.order.count({ where: { stockId: stock.id } }), 0);
  assert.equal(
    await prisma.adminActivityLog.count({
      where: { targetId: BigInt(one.id), action: 'LISTING_APPROVE' },
    }),
    1,
  );
  const approvedDetail = await json(`${route}/${one.id}`, admin.token);
  assert.equal(approvedDetail.stockId, stock.id);
  assert.equal(approvedDetail.approval.finalPrice, '11000');
  assert.equal(approvedDetail.data.desiredPrice, '10000');
  const userDetail = await json(`/listing-applications/${one.id}`, owner.token);
  assert.equal(userDetail.stockId, stock.id);
  assert.equal(
    userDetail.approval.priceAdjustmentReason,
    changedApproval.priceAdjustmentReason,
  );
  await post(one.id, 'approve', changedApproval, { status: 409 });
  await post(
    one.id,
    'reject',
    { reason: '승인 후 반려 시도' },
    { status: 409 },
  );
  const mainResponse = await request(stock.mainImageUrl.slice(4));
  assert.equal(mainResponse.status, 200);
  checks++;
  assert.deepEqual(Buffer.from(await mainResponse.arrayBuffer()), png);
  const logoResponse = await request(stock.logoImageUrl.slice(4));
  assert.equal(logoResponse.status, 200);
  checks++;
  await json(`/stocks/listing-images/${one.id}/evidence`, null, {
    status: 404,
  });
  await prisma.stock.update({
    where: { id: stock.id },
    data: { isPublic: false },
  });
  await json(stock.mainImageUrl.slice(4), null, { status: 404 });
  await prisma.stock.update({
    where: { id: stock.id },
    data: { isPublic: true },
  });
  const frozen = await prisma.attachmentCollection.findUnique({
    where: { id: main.id },
  });
  assert(frozen.frozenAt);
  await json(
    `${filesRoute}/${main.id}/attachments/${main.attachment.id}`,
    owner.token,
    { method: 'DELETE', status: 409 },
  );
  // 미래 예약은 대기하고 기한이 지난 예약만 한 번 시작한다.
  await activation.activateDueListings();
  assert.equal(
    (await prisma.stock.findUnique({ where: { id: stock.id } })).tradeStatus,
    'PENDING',
  );
  await prisma.stock.update({
    where: { id: stock.id },
    data: { listingDate: new Date(Date.now() - 1000) },
  });
  await activation.activateDueListings();
  await activation.activateDueListings();
  assert.equal(
    (await prisma.stock.findUnique({ where: { id: stock.id } })).tradeStatus,
    'ACTIVE',
  );
  const sellOrders = await prisma.order.findMany({
    where: { stockId: stock.id },
  });
  assert.equal(sellOrders.length, 1);
  assert.equal(sellOrders[0].side, 'SELL');
  assert.equal(sellOrders[0].price, 11000n);
  assert.equal(sellOrders[0].qty, 1000n);
  const holding = await prisma.holding.findFirst({
    where: { stockId: stock.id },
  });
  assert.equal(holding.qty, 1000n);
  assert.equal(holding.lockedQty, 1000n);
  assert.equal(holding.totalAmount, 11000000n);
  assert.equal(
    app.get(MatchingService).getBook(stock.id).depth('SELL', 5).length,
    1,
  );
  // 다른 프로세스처럼 별도 매칭 큐를 사용해도 발행은 한 번만 성공한다.
  const otherApp = await listing({ status: 'UNDER_REVIEW' });
  const otherApproved = await post(otherApp.id, 'approve', approval);
  const trading1 = app.get(StockTradingService);
  const independentMatching = new MatchingService(prisma);
  const { SettlementService } =
    await import('../dist/modules/matching/settlement.js');
  const trading2 = new StockTradingService(
    prisma,
    independentMatching,
    app.get(SettlementService),
  );
  const opens = await Promise.allSettled([
    trading1.openListing(otherApproved.stockId, owner.id),
    trading2.openListing(otherApproved.stockId, owner.id),
  ]);
  assert.equal(
    opens.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    await prisma.order.count({ where: { stockId: otherApproved.stockId } }),
    1,
  );
  assert.equal(
    await prisma.holding.count({ where: { stockId: otherApproved.stockId } }),
    1,
  );
  // 예약 시작과 관리자 종료가 다른 서버에서 겹쳐도 종료 상품에 미체결 주문을 남기지 않는다.
  const closingApp = await listing({ status: 'UNDER_REVIEW' });
  const closingApproved = await post(closingApp.id, 'approve', approval);
  await Promise.allSettled([
    trading1.openListing(closingApproved.stockId, owner.id),
    trading2.closeStock(closingApproved.stockId),
  ]);
  assert.equal(
    (await prisma.stock.findUnique({ where: { id: closingApproved.stockId } }))
      .tradeStatus,
    'CLOSED',
  );
  assert.equal(
    await prisma.order.count({
      where: {
        stockId: closingApproved.stockId,
        status: { in: ['ACCEPTED', 'PARTIAL'] },
      },
    }),
    0,
  );
  const closedHolding = await prisma.holding.findFirst({
    where: { stockId: closingApproved.stockId },
  });
  if (closedHolding) assert.equal(closedHolding.lockedQty, 0n);
  const activity = await json(
    `/admin/activity-logs?targetType=LISTING_APPLICATION&targetId=${one.id}`,
    admin.token,
  );
  assert(
    activity.items.some(
      (item) => item.action === 'LISTING_REVISION_DEADLINE_UPDATE',
    ),
  );
  assert(activity.items.some((item) => item.action === 'LISTING_REVIEW_START'));
  const approvalLog = await prisma.adminActivityLog.findFirst({
    where: { targetId: BigInt(one.id), action: 'LISTING_APPROVE' },
  });
  assert.equal(approvalLog.afterValue.stockId, stock.id);
  assert.equal(
    approvalLog.afterValue.priceAdjustmentReason,
    changedApproval.priceAdjustmentReason,
  );
  assert.equal(approvalLog.reason, approval.reason);
  // #88의 아직 미병합인 상태값을 이 일회용 DB에만 준비한다. 탈퇴 API 자체를 대체 검증하는 것은 아니다.
  await prisma.$executeRawUnsafe(
    "ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'WITHDRAWN'",
  );
  const ownerAccount = await prisma.account.findUniqueOrThrow({
    where: { userId: owner.id },
  });
  const setOwnerActive = () =>
    prisma.$executeRaw`UPDATE users SET user_status='ACTIVE' WHERE user_id=${owner.id}`;
  const expectAccountWait = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [row] =
        await prisma.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM accounts%' AND pid<>pg_backend_pid()) AS waiting`;
      if (row.waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('승인/발행의 공통 계좌 잠금 대기가 확인되지 않았습니다.');
  };
  const withdrawalFirst = async (run) => {
    let unlock, ready;
    const acquired = new Promise((resolve) => (ready = resolve));
    const gate = new Promise((resolve) => (unlock = resolve));
    const withdrawal = prisma.$transaction(
      async (tx) => {
        await app.get(SettlementService).lockAccounts(tx, [ownerAccount.id]);
        await tx.$executeRaw`UPDATE users SET user_status='WITHDRAWN' WHERE user_id=${owner.id}`;
        ready();
        await gate;
      },
      { timeout: 15000 },
    );
    let pending;
    try {
      await acquired;
      pending = run();
      // rejection을 즉시 처리해 의도된 BusinessException이 unhandled가 되지 않게 한다.
      pending.catch(() => {});
      await expectAccountWait();
    } finally {
      unlock();
      await withdrawal;
    }
    return pending;
  };
  const withdrawnApproval = await listing({ status: 'UNDER_REVIEW' });
  const stockCount = await prisma.stock.count();
  await withdrawalFirst(() =>
    post(withdrawnApproval.id, 'approve', approval, {
      status: 409,
      code: 'LISTING_ISSUER_WITHDRAWN',
    }),
  );
  assert.equal(await prisma.stock.count(), stockCount);
  assert.equal(
    (
      await prisma.listingApplication.findUniqueOrThrow({
        where: { id: withdrawnApproval.id },
      })
    ).status,
    'UNDER_REVIEW',
  );
  assert.equal(
    await prisma.adminActivityLog.count({
      where: {
        targetId: BigInt(withdrawnApproval.id),
        action: 'LISTING_APPROVE',
      },
    }),
    0,
  );
  await setOwnerActive();
  // 승인이 먼저 커밋되면 같은 계좌 잠금을 사용하는 #88 연계 계약에서 PENDING을 확인할 수 있다.
  const approvalFirstApp = await listing({ status: 'UNDER_REVIEW' });
  const approvalFirstResult = await post(
    approvalFirstApp.id,
    'approve',
    approval,
  );
  const withdrawalResult = await prisma.$transaction(async (tx) => {
    await app.get(SettlementService).lockAccounts(tx, [ownerAccount.id]);
    const pending = await tx.listingApplication.findFirst({
      where: {
        userId: owner.id,
        status: 'APPROVED',
        stock: { isDeleted: false, tradeStatus: 'PENDING' },
      },
    });
    if (pending) return 'BLOCKED';
    await tx.$executeRaw`UPDATE users SET user_status='WITHDRAWN' WHERE user_id=${owner.id}`;
    return 'WITHDRAWN';
  });
  assert.equal(withdrawalResult, 'BLOCKED');
  const [activeOwner] =
    await prisma.$queryRaw`SELECT user_status::text AS status FROM users WHERE user_id=${owner.id}`;
  assert.equal(activeOwner.status, 'ACTIVE');
  await trading1.closeStock(approvalFirstResult.stockId);
  // 이미 탈퇴가 진행된 예외 데이터에서도 발행 직전 잠금 이후 재검증한다.
  const holdApp = await listing({ status: 'UNDER_REVIEW' });
  const holdApproval = await post(holdApp.id, 'approve', approval);
  await assert.rejects(
    withdrawalFirst(() => trading1.openListing(holdApproval.stockId, owner.id)),
    (error) => error.error?.code === 'LISTING_ISSUER_WITHDRAWN',
  );
  const held = await prisma.stock.findUniqueOrThrow({
    where: { id: holdApproval.stockId },
  });
  assert.equal(held.tradeStatus, 'PENDING');
  assert(held.listingBlockedAt);
  assert.equal(held.listingBlockedReason, '신청자 탈퇴로 발행 보류');
  assert.equal(await prisma.order.count({ where: { stockId: held.id } }), 0);
  assert.equal(await prisma.holding.count({ where: { stockId: held.id } }), 0);
  const heldView = await json(`${route}/${holdApp.id}`, admin.token);
  assert.equal(heldView.listingBlockedReason, held.listingBlockedReason);
  assert.equal(heldView.listingBlockedAt, held.listingBlockedAt.toISOString());
  await assert.rejects(
    trading1.openListing(held.id, owner.id),
    (error) => error.error?.code === 'LISTING_ISSUER_WITHDRAWN',
  );
  assert.equal(
    (
      await prisma.stock.findUniqueOrThrow({ where: { id: held.id } })
    ).listingBlockedAt.toISOString(),
    held.listingBlockedAt.toISOString(),
  );
  await prisma.stock.update({
    where: { id: held.id },
    data: { listingDate: new Date(Date.now() - 1000) },
  });
  let heldCalls = 0;
  const originalOpen = trading1.openListing.bind(trading1);
  trading1.openListing = async (...args) => {
    if (args[0] === held.id) heldCalls++;
    return originalOpen(...args);
  };
  try {
    await activation.activateDueListings();
    await activation.activateDueListings();
  } finally {
    trading1.openListing = originalOpen;
  }
  assert.equal(
    heldCalls,
    0,
    '보류 상품은 여러 예약 주기에서도 다시 발행하지 않는다.',
  );
  await setOwnerActive();

  const swagger = await (await fetch(base + '/docs-json')).json();
  for (const suffix of [
    'start-review',
    'revision-requests',
    'revision-requests/{revisionId}/extend-deadline',
    'reject',
    'approve',
  ]) {
    assert(
      swagger.paths['/api/admin/listing-applications/{id}/' + suffix]?.post
        .security.length,
    );
  }
  console.log(
    JSON.stringify({
      result: 'PASS',
      httpChecks: checks,
      isolatedDatabase: true,
      scenarios: [
        'start-review',
        'revision-history',
        'expired-extension',
        'user-resubmit',
        'reject',
        'approval',
        'audit-rollback',
        'concurrent-approval',
        'public-images',
        'scheduled-activation',
        'concurrent-issuance',
        'activation-vs-close',
        'withdrawal-first-approval-lock',
        'approval-first-withdrawal-contract',
        'withdrawal-first-issuance-lock',
        'persisted-hold-admin-view-no-retry',
      ],
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
      assert(basename(uploads).startsWith('motu-admin-review-'));
      await rm(uploads, { recursive: true, force: true });
    }
  }
}
