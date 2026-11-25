import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AdminLoginHistoriesService } from './admin-login-histories.service.js';

describe('AdminLoginHistoriesService', () => {
  const create = vi.fn();
  const prisma = {
    adminLoginHistory: { create },
  } as unknown as PrismaService;
  const service = new AdminLoginHistoriesService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('성공 이력은 실패 사유 없이 접속 IP·기기를 남긴다', async () => {
    await service.recordSuccess(3, {
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        adminId: 3,
        result: 'SUCCESS',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
      },
    });
  });

  it('트랜잭션을 넘기면 그 트랜잭션으로 성공 이력을 남긴다', async () => {
    const txCreate = vi.fn();
    const tx = { adminLoginHistory: { create: txCreate } };

    await service.recordSuccess(3, {}, tx as never);

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('실패 이력은 실패 사유를 남기고, 접속 정보가 없으면 null로 둔다', async () => {
    await service.recordFailure(3, 'ACCOUNT_BLOCKED');

    expect(create).toHaveBeenCalledWith({
      data: {
        adminId: 3,
        result: 'FAILURE',
        failureReason: 'ACCOUNT_BLOCKED',
        ipAddress: null,
        userAgent: null,
      },
    });
  });
});
