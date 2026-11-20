// 기존 완료 문의를 실제 migrate deploy로 전환한다. localhost의 일회용 DB만 사용한다.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';

const original = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(original.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost DB만 허용합니다.',
);
const migration = '20261119110000_rename_inquiry_completed_status';
const name =
  'motu_inquiry_upgrade_' + randomUUID().replaceAll('-', '').slice(0, 12);
const url = new URL(original);
url.pathname = '/' + name;
const root = new pg.Client({ connectionString: original.toString() });
const db = new pg.Client({ connectionString: url.toString() });
let created = false;
let connected = false;
let temporary;
const deploy = async (config) =>
  promisify(execFile)(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      ...(config ? ['--config', config] : []),
    ],
    {
      timeout: 60000,
      env: { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test' },
    },
  );
try {
  temporary = await mkdtemp(path.join(tmpdir(), 'motu-inquiry-upgrade-'));
  const migrations = path.join(temporary, 'migrations');
  const entries = await readdir('prisma/migrations', { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name >= migration) continue;
    await cp(
      path.join('prisma/migrations', entry.name),
      path.join(migrations, entry.name),
      { recursive: true },
    );
  }
  const config = path.join(temporary, 'prisma.config.mjs');
  await writeFile(
    config,
    'export default ' +
      JSON.stringify({
        schema: path.resolve('prisma/schema.prisma'),
        migrations: { path: migrations },
        datasource: { url: url.toString() },
      }),
  );
  await root.connect();
  await root.query('CREATE DATABASE "' + name + '"');
  created = true;
  await deploy(config);
  await db.connect();
  connected = true;
  const user = (
    await db.query(`
    INSERT INTO users (login_id, password, email, nickname, birth_date,
      terms_agreed, privacy_agreed, marketing_agreed, role, modified_date)
    VALUES ('upgradeadmin', 'unused-test-hash', 'upgrade@motu.test', '전환테스트',
      '2000-01-01', true, true, false, 'ADMIN', now()) RETURNING user_id
  `)
  ).rows[0].user_id;
  const ids = [];
  for (const status of ['SUBMITTED', 'IN_PROGRESS', 'APPROVED']) {
    ids.push(
      (
        await db.query(
          `
      INSERT INTO inquiries (user_id, inquiry_code, inquiry_type, title, content,
        inquiry_status, modified_date, reply_email, reply_draft, reply_version,
        assigned_admin_id, completed_at)
      VALUES ($1, $2, 'LOGIN_FAILED_LOCKED', '기존 문의', '본문 보존', $3::inquiry_status,
        '2026-11-18T01:00:00Z', 'customer@motu.test', '기존 답변', 1,
        $1, CASE WHEN $3::inquiry_status = 'APPROVED' THEN '2026-11-18T02:00:00Z'::timestamptz ELSE NULL END)
      RETURNING inquiry_id
    `,
          [user, 'INQ-UPGRADE-' + status, status],
        )
      ).rows[0].inquiry_id,
    );
  }
  const completedId = ids[2];
  const attemptId = randomUUID();
  await db.query(
    `
    INSERT INTO inquiry_reply_attempts (id, inquiry_id, request_id, admin_id,
      draft_version, to_email, reply_text, status, delivery_mode, provider_message_id,
      finished_at, finalized_at)
    VALUES ($1, $2, $3, $4, 1, 'customer@motu.test', '기존 답변', 'ACCEPTED',
      'BREVO', '<existing@motu.test>', '2026-11-18T02:00:00Z', '2026-11-18T02:00:00Z')
  `,
    [attemptId, completedId, randomUUID(), user],
  );
  await db.query(
    'UPDATE inquiries SET active_reply_attempt_id = $1 WHERE inquiry_id = $2',
    [attemptId, completedId],
  );
  await db.query(
    `
    INSERT INTO admin_activity_logs (admin_id, target_type, target_id, action,
      summary, before_value, after_value)
    VALUES ($1, 'INQUIRY', $2, 'INQUIRY_REPLY_SEND', '기존 처리 완료',
      '{"status":"IN_PROGRESS"}', '{"status":"APPROVED"}')
  `,
    [user, completedId],
  );
  const snapshot = async () => ({
    inquiries: (await db.query('SELECT * FROM inquiries ORDER BY inquiry_id'))
      .rows,
    attempts: (
      await db.query('SELECT * FROM inquiry_reply_attempts ORDER BY id')
    ).rows,
    logs: (
      await db.query(
        'SELECT * FROM admin_activity_logs ORDER BY activity_log_id',
      )
    ).rows,
    enums: (
      await db.query(`SELECT e.oid, e.enumlabel, e.enumsortorder, t.typname
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname IN ('inquiry_status', 'listing_application_status', 'inquiry_reply_status')
      ORDER BY t.typname, e.enumsortorder`)
    ).rows,
  });
  const before = await snapshot();
  assert(
    before.enums.some(
      (e) => e.typname === 'inquiry_status' && e.enumlabel === 'APPROVED',
    ),
  );
  assert(
    before.enums.some(
      (e) =>
        e.typname === 'listing_application_status' &&
        e.enumlabel === 'APPROVED',
    ),
  );
  await deploy();
  const after = await snapshot();
  const expected = structuredClone(before);
  expected.inquiries.find((i) => i.inquiry_id === completedId).inquiry_status =
    'COMPLETED';
  expected.enums.find(
    (e) => e.typname === 'inquiry_status' && e.enumlabel === 'APPROVED',
  ).enumlabel = 'COMPLETED';
  assert.deepEqual(
    after,
    expected,
    '문의·발송·감사 기록과 enum OID는 유지하고 완료 이름만 변경한다.',
  );
  await assert.rejects(db.query("SELECT 'APPROVED'::inquiry_status"), {
    code: '22P02',
  });
  await deploy();
  assert.deepEqual(
    await snapshot(),
    after,
    'migrate deploy 재실행은 데이터를 변경하지 않는다.',
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL',
        [migration],
      )
    ).rows[0].count,
    1,
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      existingRowsPreserved: true,
      replyRelationsPreserved: true,
      historicalAuditPreserved: true,
      unrelatedEnumsPreserved: true,
      deployReplayPassed: true,
      isolatedDatabase: true,
      productionChanged: false,
    }),
  );
} finally {
  if (connected) await db.end();
  try {
    if (created) await root.query('DROP DATABASE "' + name + '"');
  } finally {
    await root.end();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
