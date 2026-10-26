// 로컬 Swagger 전용: 사용자 보완 조회·재제출의 시작 데이터만 준비한다.
// 사용: node scripts/prepare-listing-revision-demo.mjs [loginId, 기본 motuuser] [--expired]
import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) &&
    process.env.NODE_ENV !== 'production',
  '운영 DB에는 테스트 신청서를 만들 수 없습니다.',
);
const args = process.argv.slice(2);
assert(
  args.filter((value) => !value.startsWith('--')).length <= 1 &&
    args
      .filter((value) => value.startsWith('--'))
      .every((value) => value === '--expired'),
  '사용법: node scripts/prepare-listing-revision-demo.mjs [loginId] [--expired]',
);
const loginId = args.find((value) => !value.startsWith('--')) || 'motuuser';
const expired = args.includes('--expired');
const deadline = new Date(Date.now() + (expired ? -60000 : 7 * 86400000));
const requestContent =
  '거래액 집계 근거를 확인할 수 있는 증빙자료를 보완해 주세요.';
const previousData = {
  serviceName: '[로컬 테스트] 보완 신청',
  desiredPrice: '10000',
};
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  await client.query('BEGIN');
  const actor = await client.query(
    "SELECT user_id FROM users WHERE role='ADMIN' ORDER BY user_id LIMIT 1",
  );
  assert.equal(
    actor.rowCount,
    1,
    '로컬 seed 계정이 필요합니다. npm run db:seed를 실행해 주세요.',
  );
  const application = await client.query(
    `INSERT INTO listing_applications (user_id, application_number, submitted_at, status, service_name, draft_data, review_comment, revision_deadline, expires_at, modified_date)
     SELECT user_id, $2, now(), 'REVISION_REQUESTED', $3, $4::jsonb, $5, $6, now() + interval '90 days', now()
     FROM users WHERE login_id=$1 RETURNING application_id, application_number`,
    [
      loginId,
      `LST-DEMO-${Date.now()}`,
      previousData.serviceName,
      JSON.stringify(previousData),
      requestContent,
      deadline,
    ],
  );
  assert.equal(
    application.rowCount,
    1,
    '해당 로컬 계정이 없습니다. npm run db:seed 또는 loginId를 확인해 주세요.',
  );
  const app = application.rows[0];
  const revision = await client.query(
    `INSERT INTO listing_application_revisions (application_id, requested_by_id, request_content, deadline, previous_data, modified_date)
     VALUES ($1,$2,$3,$4,$5::jsonb,now()) RETURNING revision_id`,
    [
      app.application_id,
      actor.rows[0].user_id,
      requestContent,
      deadline,
      JSON.stringify(previousData),
    ],
  );
  await client.query('COMMIT');
  console.log(
    JSON.stringify({
      localOnly: true,
      loginId,
      applicationId: app.application_id,
      applicationNumber: app.application_number,
      revisionId: revision.rows[0].revision_id,
      status: 'REVISION_REQUESTED',
      deadline: deadline.toISOString(),
      isDeadlinePassed: expired,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
