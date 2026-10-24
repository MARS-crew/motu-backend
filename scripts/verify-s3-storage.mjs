// 실제 S3 호환 저장소 연결 검사. 비밀값은 .env에서만 읽고 출력하지 않는다.
// node scripts/verify-s3-storage.mjs [--create-bucket]
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const required = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`.env의 ${name} 값을 설정해 주세요.`);
}
const endpoint = new URL(process.env.S3_ENDPOINT);
if (endpoint.hostname.endsWith('.railway.internal')) {
  throw new Error(
    'Railway 내부 주소는 로컬 PC에서 사용할 수 없습니다. 로컬 검사에는 MinIO 9000 포트의 HTTPS 도메인을 사용하세요.',
  );
}
const region = process.env.S3_REGION || 'us-east-1';
const bucket = process.env.S3_BUCKET;
const client = new S3Client({
  endpoint: endpoint.href,
  region,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  maxAttempts: 2,
});
const key = `connectivity-checks/${randomUUID()}.png`;
const body = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
let attemptedUpload = false;
try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log('버킷 접근 성공');
  } catch (error) {
    if (
      error.$metadata?.httpStatusCode !== 404 ||
      !process.argv.includes('--create-bucket')
    )
      throw error;
    await client.send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...(region !== 'us-east-1'
          ? { CreateBucketConfiguration: { LocationConstraint: region } }
          : {}),
      }),
    );
    console.log('비공개 기본 정책으로 버킷 생성 성공');
  }
  attemptedUpload = true;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/png',
    }),
  );
  console.log('테스트 PNG 업로드 성공');
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  assert(response.Body, '응답 파일이 없습니다.');
  assert.deepEqual(
    Buffer.from(await response.Body.transformToByteArray()),
    body,
  );
  console.log('다운로드 원본 바이트 일치 확인');
} catch (error) {
  console.error(
    `저장소 검사 실패: ${error.name || 'Error'} (HTTP ${error.$metadata?.httpStatusCode ?? '-'})`,
  );
  console.error(
    'endpoint/API 포트, 버킷 이름, region, 접근 키 및 권한을 확인해 주세요.',
  );
  process.exitCode = 1;
} finally {
  if (attemptedUpload) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log('이번 검사에서 사용한 테스트 파일 정리 완료');
    } catch {
      console.error(`테스트 파일 정리 실패. 버킷 내부 ${key}를 확인해 주세요.`);
      process.exitCode = 1;
    }
  }
  client.destroy();
}
