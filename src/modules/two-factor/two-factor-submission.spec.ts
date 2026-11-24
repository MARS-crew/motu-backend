import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { VerificationsService } from '../verifications/verifications.service.js';
import { TwoFactorAction } from './two-factor.constants.js';
import { TwoFactorService } from './two-factor.service.js';

describe('상장 제출 트랜잭션의 공통 2차 보안', () => {
  const rootRead = vi.fn();
  const txRead = vi.fn();
  const service = new TwoFactorService(
    { user: { findUnique: rootRead } } as unknown as PrismaService,
    {} as VerificationsService,
  );
  const tx = {
    user: { findUnique: txRead },
  } as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    vi.clearAllMocks();
    txRead.mockResolvedValue({
      id: 1,
      userStatus: 'ACTIVE',
      twoFactorStatus: 'ENABLED',
      twoFactorPhoneNumber: '01000000000',
      twoFactorVerifiedDate: new Date(),
    });
  });
  it('회원 잠금을 보유한 동일 트랜잭션에서 인증을 다시 조회한다', async () => {
    await service.requireVerification(1, TwoFactorAction.LISTING_SUBMIT, tx);
    expect(txRead).toHaveBeenCalledOnce();
    expect(rootRead).not.toHaveBeenCalled();
  });
  it('설정 상태여도 등록 번호가 없으면 설정 화면으로 유도한다', async () => {
    txRead.mockResolvedValue({
      id: 1,
      userStatus: 'ACTIVE',
      twoFactorStatus: 'ENABLED',
      twoFactorPhoneNumber: null,
    });
    await expect(
      service.requireVerification(1, TwoFactorAction.LISTING_SUBMIT, tx),
    ).rejects.toMatchObject({
      response: {
        code: 'TWO_FACTOR_NOT_ENABLED',
        details: { action: 'LISTING_SUBMIT' },
      },
    });
  });
  it('대기 중 만료된 인증으로 접수할 수 없다', async () => {
    txRead.mockResolvedValue({
      id: 1,
      userStatus: 'ACTIVE',
      twoFactorStatus: 'ENABLED',
      twoFactorPhoneNumber: '01000000000',
      twoFactorVerifiedDate: new Date(Date.now() - 600001),
    });
    await expect(
      service.requireVerification(1, TwoFactorAction.LISTING_SUBMIT, tx),
    ).rejects.toMatchObject({
      response: {
        code: 'TWO_FACTOR_REQUIRED',
        details: { action: 'LISTING_SUBMIT' },
      },
    });
  });
});
