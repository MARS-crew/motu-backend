// npm run build 후 실행. 기존 DB가 아닌 일회용 localhost DB와 가짜 SMS 발송기를 사용한다.
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

const url = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost DB만 허용합니다.',
);
const dbName =
  'motu_submission_' + randomUUID().replaceAll('-', '').slice(0, 12);
const adminDb = new pg.Client({ connectionString: url.toString() });
url.pathname = '/' + dbName;
const tempRoot = resolve(tmpdir());
const uploads = await mkdtemp(join(tempRoot, 'motu-submission-'));
const apps = [];
const bases = [];
let createdDatabase = false;
let checks = 0;
let prisma;
const drafts = '/listing-applications/drafts';
const collections = '/files/collections';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
const smsCodes = new Map();

async function request(
  path,
  token,
  { method = 'GET', body, status = 200, code, instance = 0 } = {},
) {
  const response = await fetch(bases[instance] + path, {
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
  const result = await response.json();
  assert.equal(response.status, status, path + ' ' + JSON.stringify(result));
  if (code) assert.equal(result.error?.code, code, path);
  checks++;
  return result;
}
async function json(path, token, options) {
  return (await request(path, token, options)).data;
}
const submitPath = (draft) => `/listing-applications/${draft.id}/submit`;
const submit = (draft, user, options = {}) =>
  json(submitPath(draft), user.token, {
    method: 'POST',
    body: { expectedLastSavedAt: draft.lastSavedAt },
    ...options,
  });
async function assertUnsubmitted(id) {
  const row = await prisma.listingApplication.findUniqueOrThrow({
    where: { id },
  });
  assert.equal(row.status, 'DRAFT');
  assert.equal(row.applicationNumber, null);
  assert.equal(row.submittedAt, null);
  checks++;
}
async function waitForLock(fragment) {
  const stop = Date.now() + 5000;
  while (Date.now() < stop) {
    const { rows } = await adminDb.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE $2",
      [dbName, '%' + fragment + '%'],
    );
    if (rows.length) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error('경합 요청이 DB 잠금을 기다리지 않았습니다: ' + fragment);
}

try {
  await adminDb.connect();
  await adminDb.query('CREATE DATABASE "' + dbName + '"');
  createdDatabase = true;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
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
  const { SmsSender } = await import('../dist/common/sms/sms-sender.js');
  const { MailSender } = await import('../dist/common/mail/mail-sender.js');
  const { ListingActivationService } =
    await import('../dist/modules/listing-applications/listing-activation.service.js');
  const { ListingApplicationNumbersService, listingNumberDate } =
    await import('../dist/modules/listing-applications/listing-application-numbers.service.js');
  for (let i = 0; i < 2; i++) {
    const app = await NestFactory.create(AppModule, { logger: false });
    apps.push(app);
    app.get(SmsSender).send = async ({ to, text }) => {
      const match = text.match(/\[(\d{6})\]/);
      assert(match);
      smsCodes.set(to, match[1]);
    };
    app.get(MailSender).send = async () => {};
    setupApp(app);
    setupSwagger(app);
    await app.listen(0, '127.0.0.1');
    app.get(ListingActivationService).onModuleDestroy();
    bases.push(
      'http://127.0.0.1:' + app.getHttpServer().address().port + '/api',
    );
  }
  prisma = apps[0].get(PrismaService);
  const password = 'Listing-Test1!';
  const passwordHash = await hash(password);
  const account = async (loginId, role = 'USER') => {
    const user = await prisma.user.create({
      data: {
        loginId,
        role,
        password: passwordHash,
        nickname: loginId.slice(0, 10),
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
    return { id: user.id, token: login.accessToken };
  };
  const owner = await account('submitowner');
  const other = await account('submitother');
  const admin = await account('submitadmin', 'ADMIN');
  await prisma.sector.create({ data: { code: 1, name: '소프트웨어' } });
  async function image(user = owner, purpose = 'MAIN_IMAGE', saved = true) {
    const { id } = await json(collections, user.token, {
      method: 'POST',
      status: 201,
      body: { purpose },
    });
    const form = new FormData();
    form.append('files', new Blob([png], { type: 'image/png' }), 'main.png');
    const [file] = await json(`${collections}/${id}/uploads`, user.token, {
      method: 'POST',
      status: 201,
      body: form,
    });
    if (saved)
      await json(`${collections}/${id}`, user.token, {
        method: 'PUT',
        body: { attachmentIds: [file.id] },
      });
    return { id, file };
  }
  const main = await image();
  const logo = await image(owner, 'LOGO');
  async function evidence(
    user = owner,
    count = 1,
    saved = true,
    description = '서비스 운영과 지표를 확인할 수 있는 증빙자료입니다.',
  ) {
    const { id } = await json(collections, user.token, {
      method: 'POST',
      status: 201,
      body: { purpose: 'EVIDENCE' },
    });
    const ids = [];
    for (let i = 0; i < count; i++) {
      if (i === 0) {
        const form = new FormData();
        form.append(
          'files',
          new Blob([png], { type: 'image/png' }),
          'evidence.png',
        );
        const [file] = await json(`${collections}/${id}/uploads`, user.token, {
          method: 'POST',
          status: 201,
          body: form,
        });
        ids.push(file.id);
        continue;
      }
      const item = await json(`${collections}/${id}/links`, user.token, {
        method: 'POST',
        status: 201,
        body: { url: `https://example.com/evidence/${i}` },
      });
      ids.push(item.id);
    }
    if (saved) {
      await json(`${collections}/${id}`, user.token, {
        method: 'PUT',
        body: { attachmentIds: ids, description },
      });
    }
    return id;
  }
  const initialEvidence = await evidence();
  const valid = {
    serviceName: '제출 테스트',
    summary: '최종 제출 통합 검증용 서비스입니다.',
    sectorCode: 1,
    operatorName: '모투',
    managerName: '김신청',
    businessEmail: 'business@motu.test',
    contactPhone: '01012345678',
    mainImageCollectionId: main.id,
    logoCollectionId: logo.id,
    desiredPrice: '1000',
    totalIssuedQuantity: '10000',
    priceCalculationBasis: '서비스 가치와 시장 비교를 반영했습니다.',
    evidenceCollectionId: initialEvidence,
    evidenceDescription: '서비스 운영과 지표를 확인할 수 있는 증빙자료입니다.',
  };
  const draft = (data = valid, user = owner) =>
    json(drafts, user.token, {
      method: 'POST',
      status: 201,
      body: { currentStep: 4, data },
    });
  const dispose = (id) =>
    prisma.listingApplication.update({
      where: { id },
      data: { deletedDate: new Date() },
    });
  const first = await draft();
  const schema = await (await fetch(bases[0] + '/docs-json')).json();
  assert.equal(
    schema.paths['/api/listing-applications/{id}/submit'].post.responses['200']
      .description !== undefined,
    true,
  );
  checks++;

  await submit(first, owner, { status: 409, code: 'TWO_FACTOR_NOT_ENABLED' });
  await assertUnsubmitted(first.id);
  await submit(first, { token: null }, { status: 401 });
  await submit(first, other, {
    status: 404,
    code: 'LISTING_APPLICATION_NOT_FOUND',
  });
  for (const body of [
    {},
    { expectedLastSavedAt: 'invalid' },
    { expectedLastSavedAt: '2026-11-22T10:00:00' },
    { expectedLastSavedAt: first.lastSavedAt, status: 'APPROVED' },
    { expectedLastSavedAt: first.lastSavedAt, code: '123456' },
  ]) {
    await submit(first, owner, { body, status: 400 });
  }
  // 실제 SMS를 보내지 않고 공통 설정·재인증 HTTP API와 인증번호 소비를 검증한다.
  const phone = '01000000108';
  await json('/two-factor/phone-verifications', owner.token, {
    method: 'POST',
    status: 201,
    body: { phoneNumber: phone },
  });
  await json('/two-factor/phone-verifications/confirm', owner.token, {
    method: 'POST',
    body: { phoneNumber: phone, code: smsCodes.get(phone) },
  });
  await prisma.user.update({
    where: { id: owner.id },
    data: { twoFactorVerifiedDate: new Date(Date.now() - 600001) },
  });
  const required = await request(submitPath(first), owner.token, {
    method: 'POST',
    body: { expectedLastSavedAt: first.lastSavedAt },
    status: 403,
    code: 'TWO_FACTOR_REQUIRED',
  });
  assert.equal(required.error.details.action, 'LISTING_SUBMIT');
  await assertUnsubmitted(first.id);
  await json('/two-factor/verifications', owner.token, {
    method: 'POST',
    status: 201,
  });
  const code = smsCodes.get(phone);
  const wrongCode = code === '000000' ? '000001' : '000000';
  await json('/two-factor/verifications/confirm', owner.token, {
    method: 'POST',
    body: { code: wrongCode },
    status: 400,
  });
  await submit(first, owner, { status: 403, code: 'TWO_FACTOR_REQUIRED' });
  await json('/two-factor/verifications/confirm', owner.token, {
    method: 'POST',
    body: { code },
  });
  await json('/two-factor/verifications/confirm', owner.token, {
    method: 'POST',
    body: { code },
    status: 404,
    code: 'VERIFICATION_NOT_FOUND',
  });
  // 작성 중에는 증빙 없이도 저장할 수 있지만, 최초 접수에서는 단계·필드를 안내한다.
  const noEvidenceImage = await image();
  const noEvidence = await draft({
    ...valid,
    mainImageCollectionId: noEvidenceImage.id,
    evidenceCollectionId: null,
  });
  const incomplete = await json(
    `${drafts}/${noEvidence.id}/steps/4`,
    owner.token,
    { method: 'PUT', body: { data: {} } },
  );
  const refused = await request(submitPath(incomplete), owner.token, {
    method: 'POST',
    body: { expectedLastSavedAt: incomplete.lastSavedAt },
    status: 400,
    code: 'LISTING_SUBMISSION_VALIDATION_FAILED',
  });
  assert(
    refused.error.details.fields.some(
      (item) => item.step === 4 && item.field === 'evidenceCollectionId',
    ),
  );
  await assertUnsubmitted(noEvidence.id);
  assert.equal(
    (
      await prisma.attachmentCollection.findUniqueOrThrow({
        where: { id: noEvidenceImage.id },
      })
    ).frozenAt,
    null,
  );
  await dispose(noEvidence.id);
  // 3단계 지표는 전부 생략할 수 있다. 저장 후 받은 최신 시각을 최종 제출에 사용한다.
  await json(`${drafts}/${first.id}/steps/3`, owner.token, {
    method: 'PUT',
    body: { data: {} },
  });
  const saved = await json(`${drafts}/${first.id}`, owner.token);
  await submit(first, owner, {
    status: 409,
    code: 'LISTING_SUBMISSION_CONFLICT',
  });
  const receipt = await submit(saved, owner);
  assert.equal(receipt.applicationId, first.id);
  assert.equal(receipt.status, 'SUBMITTED');
  assert.equal(receipt.replayed, false);
  assert.equal(
    receipt.applicationNumber,
    `LST-${listingNumberDate(new Date(receipt.submittedAt))}-001`,
  );
  const original = await prisma.listingApplication.findUniqueOrThrow({
    where: { id: first.id },
  });
  assert.deepEqual(original.draftData, valid);
  assert.equal(original.lastSavedAt.toISOString(), saved.lastSavedAt);
  for (const id of [main.id, logo.id, initialEvidence]) {
    await json(`${collections}/${id}`, owner.token, {
      method: 'PUT',
      body: { attachmentIds: [] },
      status: 409,
      code: 'FILE_COLLECTION_FROZEN',
    });
  }
  const retry = await submit(saved, owner);
  assert.deepEqual(retry, { ...receipt, replayed: true });
  await json(`${drafts}/${first.id}`, owner.token, {
    method: 'PATCH',
    body: { data: { serviceName: '수정 금지' } },
    status: 409,
  });
  await json(`${drafts}/${first.id}`, owner.token, {
    method: 'DELETE',
    status: 409,
  });
  const list = await json(drafts, owner.token);
  assert(!list.items.some((item) => item.id === first.id));
  const ownStatus = await json(
    `/listing-applications/${first.id}/status`,
    owner.token,
  );
  assert.equal(ownStatus.applicationNumber, receipt.applicationNumber);
  assert.equal(ownStatus.expiresAt, null);
  const adminDetail = await json(
    `/admin/listing-applications/${first.id}`,
    admin.token,
  );
  assert.equal(adminDetail.applicationNumber, receipt.applicationNumber);
  await json(
    `/admin/listing-applications/${first.id}/start-review`,
    admin.token,
    { method: 'POST', body: {} },
  );
  await prisma.user.update({
    where: { id: owner.id },
    data: { twoFactorVerifiedDate: new Date(0) },
  });
  const reviewedRetry = await submit(saved, owner);
  assert.equal(reviewedRetry.status, 'UNDER_REVIEW');
  assert.equal(reviewedRetry.submittedAt, receipt.submittedAt);
  await prisma.user.update({
    where: { id: owner.id },
    data: { twoFactorVerifiedDate: new Date() },
  });
  // 최초 접수 → 관리자 보완 → 기존 사용자 재제출이 동일 신청서/번호/최초 접수일을 유지한다.
  const revision = await json(
    `/admin/listing-applications/${first.id}/revision-requests`,
    admin.token,
    {
      method: 'POST',
      body: {
        requestItems: ['증빙자료'],
        requestContent: '최신 자료를 제출해 주세요.',
        deadline: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  );
  const { id: evidenceId } = await json(collections, owner.token, {
    method: 'POST',
    status: 201,
    body: { purpose: 'EVIDENCE' },
  });
  const link = await json(`${collections}/${evidenceId}/links`, owner.token, {
    method: 'POST',
    status: 201,
    body: { url: 'https://example.com/submission-proof' },
  });
  await json(`${collections}/${evidenceId}`, owner.token, {
    method: 'PUT',
    body: {
      attachmentIds: [link.id],
      description: '보완 요청에 대한 최신 증빙자료입니다.',
    },
  });
  await json(
    `/listing-applications/${first.id}/revision-requests/${revision.revisionId}/resubmit`,
    owner.token,
    { method: 'POST', body: { evidenceCollectionId: evidenceId } },
  );
  const afterRevision = await prisma.listingApplication.findUniqueOrThrow({
    where: { id: first.id },
  });
  assert.equal(afterRevision.status, 'UNDER_REVIEW');
  assert.equal(afterRevision.applicationNumber, receipt.applicationNumber);
  assert.equal(afterRevision.submittedAt.toISOString(), receipt.submittedAt);
  checks++;

  // 미입력, 과거 일시, 잘못된 지표, 타인/미저장 첨부, 잘못된 용도와 legacy 입력을 재검증한다.
  const foreignImage = await image(other);
  const unsavedImage = await image(owner, 'MAIN_IMAGE', false);
  const emptyEvidence = await evidence(owner, 0);
  const unsavedEvidence = await evidence(owner, 1, false);
  const foreignEvidence = await evidence(other);
  const missingDescription = await evidence(owner, 1, true, null);
  const shortDescription = await evidence(owner, 1, true, '짧음');
  const tooManyEvidence = await evidence(owner, 10);
  await prisma.attachment.create({
    data: {
      collectionId: tooManyEvidence,
      kind: 'LINK',
      url: 'https://example.com/legacy-extra',
      saved: true,
    },
  });
  const invalidCases = [
    { ...valid, serviceName: '' },
    { ...valid, desiredPrice: '0' },
    { ...valid, desiredListingDate: '2000-01-01T00:00:00Z' },
    { ...valid, mau: '-1' },
    { ...valid, evidenceDescription: '' },
    { ...valid, mainImageCollectionId: foreignImage.id },
    { ...valid, mainImageCollectionId: unsavedImage.id },
    { ...valid, mainImageCollectionId: logo.id },
    { ...valid, evidenceCollectionId: randomUUID() },
    { ...valid, evidenceCollectionId: emptyEvidence },
    { ...valid, evidenceCollectionId: unsavedEvidence },
    { ...valid, evidenceCollectionId: foreignEvidence },
    { ...valid, evidenceCollectionId: missingDescription },
    { ...valid, evidenceCollectionId: shortDescription },
    { ...valid, evidenceCollectionId: tooManyEvidence },
    { ...valid, unexpectedLegacyField: 'invalid' },
  ];
  for (const data of invalidCases) {
    const test = await draft();
    // 기존 seed/DB 입력도 제출 시 재검증한다. 초안 DTO를 의도적으로 거치지 않는 fixture다.
    await prisma.listingApplication.update({
      where: { id: test.id },
      data: { draftData: data },
    });
    await submit(test, owner, {
      status: 400,
      code: 'LISTING_SUBMISSION_VALIDATION_FAILED',
    });
    await assertUnsubmitted(test.id);
    await dispose(test.id);
  }
  const expired = await draft();
  await prisma.listingApplication.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(0) },
  });
  await submit(expired, owner, { status: 410, code: 'LISTING_DRAFT_EXPIRED' });
  await dispose(expired.id);
  const deleted = await draft();
  await dispose(deleted.id);
  await submit(deleted, owner, {
    status: 404,
    code: 'LISTING_APPLICATION_NOT_FOUND',
  });
  const broken = await draft();
  await prisma.listingApplication.update({
    where: { id: broken.id },
    data: { status: 'SUBMITTED' },
  });
  await submit(broken, owner, {
    status: 409,
    code: 'LISTING_SUBMISSION_INVALID_STATUS',
  });
  await dispose(broken.id);

  // 증빙 1개·10개로 실제 최초 접수한 건을 관리자 승인까지 연결한다.
  await prisma.account.create({ data: { userId: owner.id, cash: 0n } });
  for (const count of [1, 10]) {
    const id = await evidence(owner, count);
    const ready = await draft({ ...valid, evidenceCollectionId: id });
    const submitted = await submit(ready, owner);
    await json(
      `/admin/listing-applications/${ready.id}/start-review`,
      admin.token,
      { method: 'POST', body: {} },
    );
    const day = listingNumberDate(new Date());
    const approval = await json(
      `/admin/listing-applications/${ready.id}/approve`,
      admin.token,
      {
        method: 'POST',
        body: {
          finalPrice: '1000',
          totalIssuedQuantity: '10000',
          listingDate: `20${day.slice(0, 2)}-${day.slice(2, 4)}-${day.slice(4)}`,
          tradingStartAt: new Date(Date.now() + 86400000).toISOString(),
          reason: '증빙을 포함한 최초 접수 승인 검증',
        },
      },
    );
    assert.equal(approval.status, 'APPROVED');
    assert(approval.stockId);
    assert.equal(approval.applicationNumber, submitted.applicationNumber);
    checks++;
  }

  // 다른 서버 인스턴스에서 같은 신청서를 동시에 제출해도 한 번만 접수한다.
  const concurrent = await draft();
  const repeated = await Promise.all([
    submit(concurrent, owner),
    submit(concurrent, owner, { instance: 1 }),
  ]);
  assert.equal(repeated.filter((item) => !item.replayed).length, 1);
  assert.equal(new Set(repeated.map((item) => item.applicationNumber)).size, 1);
  checks++;
  await prisma.user.update({
    where: { id: other.id },
    data: {
      twoFactorStatus: 'ENABLED',
      twoFactorPhoneNumber: '01000000109',
      twoFactorVerifiedDate: new Date(),
    },
  });
  const different = await Promise.all([
    draft(),
    draft(
      {
        ...valid,
        mainImageCollectionId: foreignImage.id,
        logoCollectionId: undefined,
        evidenceCollectionId: foreignEvidence,
      },
      other,
    ),
  ]);
  const twoReceipts = await Promise.all([
    submit(different[0], owner),
    submit(different[1], other, { instance: 1 }),
  ]);
  assert.equal(
    new Set(twoReceipts.map((item) => item.applicationNumber)).size,
    2,
  );
  checks++;

  const numbers = apps[0].get(ListingApplicationNumbersService);
  const next = numbers.next.bind(numbers);
  const rollbackImage = await image();
  const rollback = await draft({
    ...valid,
    mainImageCollectionId: rollbackImage.id,
  });
  numbers.next = async (tx) => {
    await next(tx);
    await tx.user.update({
      where: { id: owner.id },
      data: { twoFactorVerifiedDate: new Date(0) },
    });
    return `LST-${listingNumberDate(new Date())}-998`;
  };
  try {
    await submit(rollback, owner, { status: 403, code: 'TWO_FACTOR_REQUIRED' });
  } finally {
    numbers.next = next;
  }
  await assertUnsubmitted(rollback.id);
  assert.equal(
    (
      await prisma.attachmentCollection.findUniqueOrThrow({
        where: { id: rollbackImage.id },
      })
    ).frozenAt,
    null,
  );
  assert(
    (
      await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })
    ).twoFactorVerifiedDate.getTime() >
      Date.now() - 600000,
  );
  checks++;
  numbers.next = async (tx) => {
    await next(tx);
    throw new Error('Injected persistence failure');
  };
  try {
    await submit(rollback, owner, { status: 500 });
  } finally {
    numbers.next = next;
  }
  await assertUnsubmitted(rollback.id);
  assert.equal(
    (
      await prisma.attachmentCollection.findUniqueOrThrow({
        where: { id: rollbackImage.id },
      })
    ).frozenAt,
    null,
  );
  checks++;
  await dispose(rollback.id);

  // 삭제된 999번도 재사용하지 않는다. 번호 발급 불가 시 첨부 동결도 되돌린다.
  const exhausted = await draft({
    ...valid,
    mainImageCollectionId: rollbackImage.id,
  });
  const limitFixture = await prisma.listingApplication.create({
    data: {
      userId: owner.id,
      applicationNumber: `LST-${listingNumberDate(new Date())}-999`,
      submittedAt: new Date(),
      status: 'SUBMITTED',
      expiresAt: new Date(),
      deletedDate: new Date(),
    },
  });
  await submit(exhausted, owner, {
    status: 409,
    code: 'LISTING_SUBMISSION_NUMBER_LIMIT',
  });
  await assertUnsubmitted(exhausted.id);
  assert.equal(
    (
      await prisma.attachmentCollection.findUniqueOrThrow({
        where: { id: rollbackImage.id },
      })
    ).frozenAt,
    null,
  );
  await prisma.listingApplication.delete({ where: { id: limitFixture.id } });
  await dispose(exhausted.id);

  // 제출이 회원 잠금을 보유하는 동안 자동 저장은 접수 완료 후 409가 된다.
  const racing = await draft();
  let entered;
  let release;
  const atNumber = new Promise((done) => {
    entered = done;
  });
  const gate = new Promise((done) => {
    release = done;
  });
  numbers.next = async (tx) => {
    const value = await next(tx);
    entered();
    await gate;
    return value;
  };
  const submitting = submit(racing, owner);
  const insertAuthReferences = async () => {
    // 제출·저장 잠금은 직렬화하지만 회원 FK의 KEY SHARE와 충돌하지 않아야 한다.
    await apps[1].get(PrismaService).$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1500ms'");
      await tx.refreshToken.create({
        data: {
          userId: owner.id,
          tokenHash: randomUUID().replaceAll('-', '').repeat(2),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.trustedDevice.create({
        data: {
          userId: owner.id,
          deviceIdHash: randomUUID().replaceAll('-', '').repeat(2),
          lastUsedDate: new Date(),
        },
      });
    });
    checks++;
  };
  try {
    await Promise.race([
      atNumber,
      submitting.then(() => {
        throw new Error('경합 테스트의 발급 대기 지점에 도달하지 않았습니다.');
      }),
    ]);
    await insertAuthReferences();
    const saving = json(`${drafts}/${racing.id}`, owner.token, {
      method: 'PATCH',
      body: { data: { serviceName: '동시 저장' } },
      status: 409,
    });
    await waitForLock('SELECT user_id FROM users');
    release();
    await Promise.all([submitting, saving]);
    assert.equal(
      (
        await prisma.listingApplication.findUniqueOrThrow({
          where: { id: racing.id },
        })
      ).serviceName,
      valid.serviceName,
    );
    checks++;
  } finally {
    release();
    numbers.next = next;
  }

  const { ListingStepValidationService } =
    await import('../dist/modules/listing-applications/listing-step-validation.service.js');
  const validator = apps[0].get(ListingStepValidationService);
  const validate = validator.validate.bind(validator);
  const savingDraft = await draft();
  let atSave;
  let releaseSave;
  const savingStarted = new Promise((done) => {
    atSave = done;
  });
  const saveGate = new Promise((done) => {
    releaseSave = done;
  });
  validator.validate = async (...args) => {
    const issues = await validate(...args);
    atSave();
    await saveGate;
    return issues;
  };
  const saveRequest = json(`${drafts}/${savingDraft.id}/steps/4`, owner.token, {
    method: 'PUT',
    body: { data: {} },
  });
  try {
    await Promise.race([
      savingStarted,
      saveRequest.then(() => {
        throw new Error('저장 잠금 검증 지점 미도달');
      }),
    ]);
    await insertAuthReferences();
    releaseSave();
    await saveRequest;
  } finally {
    releaseSave();
    validator.validate = validate;
  }
  await dispose(savingDraft.id);

  // JWT 검증 직후 계정 정지가 확정돼도 트랜잭션 내부 재검증으로 제출을 차단한다.
  const blocked = await draft();
  const blocker = new pg.Client({ connectionString: url.toString() });
  await blocker.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      "UPDATE users SET user_status='BLOCKED' WHERE user_id=$1",
      [owner.id],
    );
    const pending = submit(blocked, owner, {
      status: 403,
      code: 'AUTH_ACCOUNT_BLOCKED',
    });
    await waitForLock('SELECT user_id FROM users');
    await blocker.query('COMMIT');
    await pending;
  } finally {
    await blocker.query('ROLLBACK');
    await blocker.end();
  }
  await assertUnsubmitted(blocked.id);
  const totals = await prisma.listingApplication.groupBy({
    by: ['applicationNumber'],
    where: { applicationNumber: { not: null } },
    _count: true,
  });
  assert(totals.every((item) => item._count === 1));
  checks++;
  console.log(
    JSON.stringify({
      ok: true,
      checks,
      database: 'disposable-local-only',
      instances: 2,
      realSmsSent: false,
      scenarios: [
        'real-2fa-setup-and-reauthentication',
        'ownership-and-input-validation',
        'optional-step3',
        'required-saved-evidence-and-description',
        'initial-evidence-1-and-10-approval',
        'submission-and-draft-auth-fk-compatibility',
        'initial-submit-and-idempotency',
        'attachment-freeze-and-rollback',
        'admin-review-and-existing-resubmit',
        'cross-instance-concurrent-submission',
        'daily-number-limit',
        'save-vs-submit',
        'account-block-vs-submit',
      ],
    }),
  );
} finally {
  try {
    await Promise.all(apps.map((app) => app.close()));
  } finally {
    try {
      if (createdDatabase)
        await adminDb.query('DROP DATABASE "' + dbName + '"');
    } finally {
      await adminDb.end();
      assert.equal(dirname(uploads), tempRoot);
      assert(basename(uploads).startsWith('motu-submission-'));
      await rm(uploads, { recursive: true, force: true });
    }
  }
}
