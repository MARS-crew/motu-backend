// 로컬 Swagger 전용. 저장 완료된 본인 묶음을 연결해 접수 신청서 3개를 만든다.
// node scripts/prepare-admin-listing-review-demo.mjs --main-image UUID --evidence UUID [--login-id motuuser]
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
assert(
  ['localhost', '127.0.0.1'].includes(url.hostname) &&
    process.env.NODE_ENV !== 'production',
  '비운영 localhost DB에서만 실행할 수 있습니다.',
);
const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i += 2) {
  assert(
    ['--main-image', '--evidence', '--login-id'].includes(args[i]) &&
      args[i + 1] &&
      !options.has(args[i]),
    '사용법: node scripts/prepare-admin-listing-review-demo.mjs --main-image UUID --evidence UUID [--login-id motuuser]',
  );
  options.set(args[i], args[i + 1]);
}
const loginId = options.get('--login-id') || 'motuuser';
const mainImageId = options.get('--main-image');
const evidenceId = options.get('--evidence');
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert(
  uuid.test(mainImageId || '') && uuid.test(evidenceId || ''),
  '대표 이미지·증빙 묶음 UUID를 입력해 주세요. 파일 ID가 아닌 작성 묶음 ID입니다.',
);
const client = new pg.Client({ connectionString: url.toString() });
try {
  await client.connect();
  await client.query('BEGIN');
  const owner = await client.query(
    "SELECT user_id FROM users WHERE login_id=$1 AND user_status='ACTIVE' FOR UPDATE",
    [loginId],
  );
  assert.equal(
    owner.rowCount,
    1,
    '계정이 없습니다. npm run db:seed 후 로그인 아이디를 확인해 주세요.',
  );
  const userId = owner.rows[0].user_id;
  const account = await client.query(
    'SELECT account_id FROM accounts WHERE user_id=$1',
    [userId],
  );
  assert.equal(
    account.rowCount,
    1,
    '신청자의 거래 계좌가 필요합니다. 로컬 seed를 먼저 적용해 주세요.',
  );
  const sector = await client.query(
    'SELECT sector_code FROM sectors ORDER BY sector_code LIMIT 1',
  );
  assert.equal(
    sector.rowCount,
    1,
    '카테고리가 없습니다. npm run db:seed를 먼저 실행해 주세요.',
  );
  const readCollection = async (id, purpose) => {
    const result = await client.query(
      'SELECT id, description, saved_at FROM attachment_collections WHERE id=$1::uuid AND user_id=$2 AND purpose=$3 FOR UPDATE',
      [id, userId, purpose],
    );
    assert.equal(
      result.rowCount,
      1,
      `${purpose}: 본인 작성 묶음과 용도를 확인해 주세요.`,
    );
    const collection = result.rows[0];
    assert(
      collection.saved_at,
      `${purpose}: PUT /api/files/collections/{id}로 선택 자료를 저장해 주세요.`,
    );
    const attachments = await client.query(
      'SELECT kind, content_type, object_key FROM attachments WHERE collection_id=$1::uuid AND saved=true',
      [id],
    );
    if (purpose === 'MAIN_IMAGE') {
      assert(
        attachments.rowCount === 1 &&
          attachments.rows[0].kind === 'FILE' &&
          attachments.rows[0].content_type?.startsWith('image/') &&
          attachments.rows[0].object_key,
        '대표 이미지에는 저장 완료된 이미지 파일 1개가 필요합니다.',
      );
    } else {
      assert(
        attachments.rowCount >= 1 &&
          attachments.rowCount <= 10 &&
          collection.description?.trim().length >= 10 &&
          collection.description.length <= 500,
        '증빙에는 저장 완료 파일·링크 1~10개와 설명 10~500자가 필요합니다.',
      );
    }
    return collection;
  };
  await readCollection(mainImageId, 'MAIN_IMAGE');
  const evidence = await readCollection(evidenceId, 'EVIDENCE');
  const prefix = 'LST-DEMO-' + randomUUID().replaceAll('-', '').slice(0, 16);
  const applications = {};
  for (const [label, suffix] of [
    ['A', '승인'],
    ['B', '보완'],
    ['C', '반려'],
  ]) {
    const data = {
      serviceName: '[로컬 심사] ' + suffix,
      summary: '관리자 상장 심사 기능을 확인하는 로컬 테스트입니다.',
      description:
        'Swagger에서 승인·반려·보완 요청을 확인하기 위한 신청서입니다.',
      sectorCode: sector.rows[0].sector_code,
      operatorName: '로컬 테스트 운영사',
      managerName: '테스트 담당자',
      businessEmail: 'review@motu.test',
      contactPhone: '01012345678',
      mainImageCollectionId: mainImageId,
      evidenceCollectionId: evidenceId,
      desiredPrice: '10000',
      totalIssuedQuantity: '1000',
      minOrderQuantity: '1',
      tickSize: '10',
      priceCalculationBasis:
        '로컬 상장 심사 테스트를 위한 가격 산정 근거입니다.',
      evidenceDescription: evidence.description,
    };
    const result = await client.query(
      `INSERT INTO listing_applications
      (user_id,application_number,submitted_at,status,service_name,current_step,draft_data,expires_at,modified_date)
      VALUES ($1,$2,now(),'SUBMITTED',$3,4,$4::jsonb,now()+interval '90 days',now())
      RETURNING application_id,application_number,status`,
      [userId, prefix + '-' + label, data.serviceName, JSON.stringify(data)],
    );
    const row = result.rows[0];
    applications[label] = {
      purpose: suffix,
      applicationId: row.application_id,
      applicationNumber: row.application_number,
      status: row.status,
    };
  }
  await client.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        localOnly: true,
        loginId,
        applications,
        revisionBody: {
          requestItems: ['증빙자료'],
          requestContent:
            '최신 운영 지표를 확인할 수 있는 자료로 보완해 주세요.',
          deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
        extensionBody: {
          deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
          reason: '추가 자료 준비를 위해 기한 연장',
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
