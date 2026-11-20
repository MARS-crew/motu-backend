import { BusinessException } from '../../common/exceptions/business.exception.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { MatchingErrors } from '../matching/matching.errors.js';
import type { StockTradingService } from '../matching/stock-trading.service.js';
import { ListingActivationService } from './listing-activation.service.js';

describe('승인 상품 거래 시작 예약', () => {
  const findMany = vi.fn();
  const openListing = vi.fn();
  const service = new ListingActivationService(
    { listingApplication: { findMany } } as unknown as PrismaService,
    { openListing } as unknown as StockTradingService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    findMany.mockResolvedValue([]);
    openListing.mockResolvedValue({ orderId: 1n });
  });
  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('공개 여부와 관계없이 기한이 지난 승인·거래 대기 상품만 조회한다', async () => {
    await service.activateDueListings();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          deletedDate: null,
          stock: {
            isDeleted: false,
            tradeStatus: 'PENDING',
            listingDate: { lte: expect.any(Date) },
            listingBlockedAt: null,
          },
        }),
      }),
    );
    expect(openListing).not.toHaveBeenCalled();
  });

  it('한 상품의 실패나 다른 서버의 선처리 때문에 다음 상품을 건너뛰지 않는다', async () => {
    findMany.mockResolvedValueOnce([
      { id: 1, stockId: 7, userId: 10 },
      { id: 2, stockId: 8, userId: 11 },
      { id: 3, stockId: 9, userId: 12 },
    ]);
    openListing
      .mockRejectedValueOnce(new Error('일시적 계좌 오류'))
      .mockRejectedValueOnce(
        new BusinessException(MatchingErrors.LISTING_NOT_PENDING),
      );
    await service.activateDueListings();
    expect(openListing.mock.calls).toEqual([
      [7, 10],
      [8, 11],
      [9, 12],
    ]);
  });

  it('앞의 100건이 모두 실패해도 뒤 예약을 처리한다', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      stockId: i + 100,
      userId: 1,
    }));
    findMany
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([{ id: 150, stockId: 500, userId: 2 }]);
    openListing.mockRejectedValue(
      new BusinessException(MatchingErrors.LISTING_NOT_PENDING),
    );
    await service.activateDueListings();
    expect(findMany.mock.calls[1][0].where.id).toEqual({ gt: 100 });
    expect(openListing).toHaveBeenLastCalledWith(500, 2);
    expect(openListing).toHaveBeenCalledTimes(101);
  });

  it('이전 주기가 진행 중이면 겹쳐 실행하지 않고 실패 후 다음 주기에 재시도한다', async () => {
    let finish!: (value: never[]) => void;
    findMany.mockReturnValueOnce(
      new Promise<never[]>((resolve) => {
        finish = resolve;
      }),
    );
    const first = service.activateDueListings();
    await service.activateDueListings();
    expect(findMany).toHaveBeenCalledTimes(1);
    finish([]);
    await first;
    findMany.mockRejectedValueOnce(new Error('DB 실패'));
    await service.activateDueListings();
    await service.activateDueListings();
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('서버 시작 즉시 확인하고 종료 시 주기 실행을 중지한다', async () => {
    vi.useFakeTimers();
    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(5000);
    expect(findMany).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10000);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
