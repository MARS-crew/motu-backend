// npm run build 후 실행. localhost 개발 DB와 로컬 서버만 사용한다.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
assert(
  ['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname),
  '로컬 DB만 테스트할 수 있습니다.',
);
const port = 3089;
const base = `http://127.0.0.1:${port}/api`;
const server = spawn(process.execPath, ['dist/main.js'], {
  env: { ...process.env, PORT: String(port), FILE_STORAGE_DRIVER: 'local' },
  stdio: 'ignore',
});
const client = new pg.Client({ connectionString: databaseUrl });
const collections = [];
const sessions = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
let checks = 0;
async function call(path, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  checks++;
  return data.data;
}
function multipart(name = 'proof.png', body = png, type = 'image/png') {
  const form = new FormData();
  form.append('files', new Blob([body], { type }), name);
  return form;
}
try {
  await client.connect();
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(200);
  }
  assert(ready, '테스트 서버 시작 실패');
  async function login(loginId, password) {
    const result = await call('/auth/login', null, 'POST', {
      loginId,
      password,
    });
    sessions.push(result.refreshToken);
    return result.accessToken;
  }
  const token = await login('motuuser', 'motuuser1!');
  const other = await login('motuadmin', 'motuadmin1!');
  async function create(purpose) {
    const result = await call(
      '/files/collections',
      token,
      'POST',
      { purpose },
      201,
    );
    collections.push(result.id);
    return result.id;
  }
  const id = await create('EVIDENCE');
  const path = `/files/collections/${id}`;
  await call(path, null, 'GET', undefined, 401);
  await call(path, other, 'GET', undefined, 404);
  await call(
    path + '/uploads',
    token,
    'POST',
    multipart('proof.pdf', png, 'application/pdf'),
    400,
  );
  await call(
    path + '/uploads',
    token,
    'POST',
    multipart('proof.png', Buffer.alloc(10 * 1024 * 1024 + 1)),
    413,
  );
  await call(
    path + '/links',
    token,
    'POST',
    { url: 'http://example.com' },
    400,
  );
  const [file] = await call(path + '/uploads', token, 'POST', multipart(), 201);
  assert.equal(file.saved, false);
  const download = await fetch(base.replace('/api', '') + file.downloadPath, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  checks++;
  await call(
    path,
    token,
    'PUT',
    {
      attachmentIds: [randomUUID()],
      description: '유효한 자료 설명 테스트입니다.',
      validateStep: true,
    },
    400,
  );
  await call(
    path,
    token,
    'PUT',
    { attachmentIds: [file.id], description: '짧음', validateStep: true },
    400,
  );
  const saved = await call(path, token, 'PUT', {
    attachmentIds: [file.id],
    description: '최근 12개월 지표 증빙 자료입니다.',
    validateStep: true,
  });
  assert.equal(saved.attachments[0].saved, true);
  const results = await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      fetch(base + path + '/links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: `https://example.com/${index}` }),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 9);
  assert.equal(results.filter((r) => r.status === 400).length, 6);
  checks++;
  assert.equal((await call(path, token)).attachments.length, 10);
  await call(path + `/attachments/${file.id}`, other, 'DELETE', undefined, 404);
  await call(path + `/attachments/${file.id}`, token, 'DELETE');
  await call(
    path + `/attachments/${file.id}/content`,
    token,
    'GET',
    undefined,
    404,
  );
  const logo = `/files/collections/${await create('LOGO')}`;
  await call(
    logo + '/uploads',
    token,
    'POST',
    multipart('proof.pdf', Buffer.from('%PDF-1.7\nexample'), 'application/pdf'),
    400,
  );
  const [image] = await call(
    logo + '/uploads',
    token,
    'POST',
    multipart(
      'image.JPG',
      Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0]),
      'image/jpeg',
    ),
    201,
  );
  await call(logo + '/uploads', token, 'POST', multipart(), 400);
  await call(logo + `/attachments/${image.id}`, token, 'DELETE');
  await call(logo + '/uploads', token, 'POST', multipart(), 201);
  // 테스트가 만든 파일/링크만 API로 삭제하여 저장소까지 정리한다.
  for (const collection of collections) {
    const route = `/files/collections/${collection}`;
    const state = await call(route, token);
    for (const item of state.attachments)
      await call(`${route}/attachments/${item.id}`, token, 'DELETE');
  }
  console.log(
    `Files HTTP/DB integration: ${checks} checks passed (including concurrent 10-item limit).`,
  );
} finally {
  for (const refreshToken of sessions) {
    try {
      await call('/auth/logout', null, 'POST', { refreshToken });
    } catch {}
  }
  for (const id of collections)
    await client.query('DELETE FROM attachment_collections WHERE id=$1', [id]);
  await client.end();
  server.kill();
}
