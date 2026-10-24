import { ConfigService } from '@nestjs/config';
import { FileStorageService } from './file-storage.service.js';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
describe('S3 호환 저장소 어댑터', () => {
  const storage = new FileStorageService(
    new ConfigService({
      FILE_STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'http://minio:9000',
      S3_BUCKET: 'test',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
    }),
  );
  beforeEach(() => vi.resetAllMocks());
  it('MinIO PutObject에 버킷·키·바이트·검증 MIME를 전달한다', async () => {
    send.mockResolvedValueOnce({});
    const body = Buffer.from('file');
    await storage.put('key', body, 'image/png');
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'test',
      Key: 'key',
      Body: body,
      ContentType: 'image/png',
    });
  });
  it('실패를 공통 저장소 오류로 바꾼다', async () => {
    send.mockRejectedValueOnce(new Error('credentials'));
    await expect(
      storage.put('key', Buffer.from('file'), 'image/png'),
    ).rejects.toMatchObject({ error: { code: 'FILE_STORAGE_UNAVAILABLE' } });
  });
  it('비공개 파일을 GetObject로 읽는다', async () => {
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
    });
    expect(await storage.get('key')).toEqual(Buffer.from([1, 2]));
  });
  it('삭제 대상을 DeleteObject에 전달한다', async () => {
    send.mockResolvedValueOnce({});
    await storage.remove('key');
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'test', Key: 'key' });
  });
});
