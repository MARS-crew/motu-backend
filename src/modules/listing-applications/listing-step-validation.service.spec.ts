import { BusinessException } from '../../common/exceptions/business.exception.js';
import { FileErrors } from '../files/files.errors.js';
import type { FilesService } from '../files/files.service.js';
import type { SectorsService } from '../sectors/sectors.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';

describe('단계별 첨부와 카테고리 확인', () => {
  const files = { getSavedCollection: vi.fn() };
  const sectors = { getSectors: vi.fn() };
  const tx = {} as Prisma.TransactionClient;
  const service = new ListingStepValidationService(
    files as unknown as FilesService,
    sectors as unknown as SectorsService,
  );
  const basic = {
    serviceName: '테스트',
    summary: '테스트 서비스 설명입니다.',
    sectorCode: 1,
    mainImageCollectionId: 'main',
    operatorName: '운영사',
    managerName: '담당자',
    businessEmail: 'owner@example.com',
    contactPhone: '01012345678',
  };
  beforeEach(() => {
    vi.resetAllMocks();
    sectors.getSectors.mockResolvedValue({
      items: [{ sectorCode: 1, sectorName: '기타' }],
    });
    files.getSavedCollection.mockResolvedValue({
      id: 'main',
      purpose: 'MAIN_IMAGE',
      description: null,
      attachments: [{ kind: 'FILE', contentType: 'image/png', saved: true }],
    });
  });
  it('같은 트랜잭션의 완료 이미지와 카테고리를 확인한다', async () => {
    expect(await service.validate(1, 1, basic, new Date(), tx)).toEqual([]);
    expect(files.getSavedCollection).toHaveBeenCalledWith(1, 'main', tx);
  });
  it('없는 카테고리를 거부한다', async () => {
    expect(
      await service.validate(
        1,
        1,
        { ...basic, sectorCode: 999 },
        new Date(),
        tx,
      ),
    ).toContainEqual(expect.objectContaining({ field: 'sectorCode' }));
  });
  it.each([
    { purpose: 'MAIN_IMAGE', attachments: [] },
    {
      purpose: 'LOGO',
      attachments: [{ kind: 'FILE', contentType: 'image/png' }],
    },
    {
      purpose: 'MAIN_IMAGE',
      attachments: [{ kind: 'LINK', contentType: null }],
    },
  ])('잘못된 이미지 묶음을 거부한다 (%j)', async (collection) => {
    files.getSavedCollection.mockResolvedValue(collection);
    expect(await service.validate(1, 1, basic, new Date(), tx)).toContainEqual(
      expect.objectContaining({ field: 'mainImageCollectionId' }),
    );
  });
  it('타인의 첨부를 필드 오류로 안내하고 조회에는 노출하지 않는다', async () => {
    files.getSavedCollection.mockRejectedValue(
      new BusinessException(FileErrors.NOT_FOUND),
    );
    expect(await service.validate(1, 1, basic, new Date(), tx)).toContainEqual(
      expect.objectContaining({ field: 'mainImageCollectionId' }),
    );
    expect(await service.getAttachments(1, basic)).toEqual({
      logo: null,
      mainImage: null,
      evidence: null,
    });
  });
  it('저장소·DB 장애를 첨부 없음으로 숨기지 않는다', async () => {
    files.getSavedCollection.mockRejectedValue(new Error('DB unavailable'));
    await expect(service.getAttachments(1, basic)).rejects.toThrow(
      'DB unavailable',
    );
  });
});
