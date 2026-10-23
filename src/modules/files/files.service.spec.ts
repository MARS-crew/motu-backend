import { FilesService } from './files.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { FileStorageService } from './file-storage.service.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
describe('FilesService 저장 보장', () => {
  const tx = {
    $queryRaw: vi.fn(),
    attachment: { count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    attachmentCollection: { update: vi.fn() },
  };
  const prisma = {
    attachmentCollection: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (arg: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const storage = { put: vi.fn(), cleanup: vi.fn() };
  const service = new FilesService(
    prisma as unknown as PrismaService,
    storage as unknown as FileStorageService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    storage.put.mockResolvedValue(undefined);
    storage.cleanup.mockResolvedValue(undefined);
    prisma.attachmentCollection.findFirst.mockResolvedValue({
      id: 'group',
      purpose: 'EVIDENCE',
      description: null,
      attachments: [],
    });
    tx.$queryRaw.mockResolvedValue([{ id: 'group', purpose: 'EVIDENCE' }]);
    tx.attachment.count.mockResolvedValue(0);
  });
  const files = [
    { originalname: 'proof.png', mimetype: 'image/png', buffer: png },
  ] as Express.Multer.File[];
  it('저장소 실패 시 DB 완료 기록을 만들지 않고 정리한다', async () => {
    storage.put.mockRejectedValueOnce(new Error('storage offline'));
    await expect(service.upload(1, 'group', files)).rejects.toThrow(
      'storage offline',
    );
    expect(tx.attachment.create).not.toHaveBeenCalled();
    expect(storage.cleanup).toHaveBeenCalled();
  });
  it('동시 요청으로 마지막 자리가 찬 경우 저장소 파일을 정리한다', async () => {
    tx.attachment.count.mockResolvedValueOnce(10);
    await expect(service.upload(1, 'group', files)).rejects.toMatchObject({
      error: { code: 'FILE_LIMIT_EXCEEDED' },
    });
    expect(storage.cleanup).toHaveBeenCalled();
    expect(tx.attachment.create).not.toHaveBeenCalled();
  });
  it('다른 묶음 또는 미완료 ID는 저장하지 않는다', async () => {
    await expect(
      service.save(1, 'group', { attachmentIds: ['unknown'] }),
    ).rejects.toMatchObject({ error: { code: 'FILE_NOT_COMPLETED' } });
    expect(tx.attachment.updateMany).not.toHaveBeenCalled();
  });
  it('다음 단계에서 짧은 증빙 설명을 거부한다', async () => {
    await expect(
      service.save(1, 'group', {
        attachmentIds: [],
        description: '짧음',
        validateStep: true,
      }),
    ).rejects.toThrow();
  });
  it('소유자 검증 실패 시 파일을 저장하지 않는다', async () => {
    prisma.attachmentCollection.findFirst.mockResolvedValueOnce(null);
    await expect(service.upload(2, 'group', files)).rejects.toMatchObject({
      error: { code: 'FILE_NOT_FOUND' },
    });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
