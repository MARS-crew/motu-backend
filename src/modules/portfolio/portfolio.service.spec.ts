import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TradeStatus } from '../../generated/prisma/client.js';
import { ChartsService } from '../charts/charts.service.js';
import { PortfolioService } from './portfolio.service.js';

describe('PortfolioService', () => {
  const account = { findUnique: vi.fn() };
  const prisma = { account } as unknown as PrismaService;
  /** 상품 ID별 현재가. 없으면 기준가를 쓴다. */
  let prices: Record<number, number> = {};
  const getDailySummaries = vi.fn(
    (stocks: { id: number; basePrice: bigint }[]) =>
      Promise.resolve(
        new Map(
          stocks.map(({ id, basePrice }) => [
            id,
            { currentPrice: prices[id] ?? Number(basePrice) },
          ]),
        ),
      ),
  );
  const service = new PortfolioService(prisma, {
    getDailySummaries,
  } as unknown as ChartsService);

  const now = new Date('2026-10-28T10:00:00.000Z');

  const holdingOf = (
    stockId: number,
    qty: bigint,
    totalAmount: bigint,
    lockedQty = 0n,
  ) => ({
    stockId,
    qty,
    lockedQty,
    totalAmount,
    stock: {
      id: stockId,
      stockCode: `MOTU000${stockId}`,
      name: `Stock${stockId}`,
      logoImageUrl: null,
      basePrice: 1_000n,
      tradeStatus: TradeStatus.ACTIVE,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prices = {};
  });

  it('보유 종목을 현재가로 평가해 총 자산, 평가손익, 자산 구성 비율을 계산한다', async () => {
    account.findUnique.mockResolvedValue({
      cash: 2_000_000n,
      lockedCash: 100_000n,
      holdings: [
        // 매입 500,100P(수수료 포함), 현재가 1,200P × 500주 = 600,000P
        holdingOf(1, 500n, 500_100n, 100n),
        // 매입 400,080P, 현재가 기준가 1,000P × 400주 = 400,000P
        holdingOf(2, 400n, 400_080n),
      ],
    });
    prices = { 1: 1_200 };

    const result = await service.getPortfolio(7, now);

    expect(account.findUnique).toHaveBeenCalledWith({
      where: { userId: 7 },
      include: { holdings: { include: { stock: true } } },
    });
    expect(result).toEqual({
      totalAsset: 3_000_000,
      cash: 2_000_000,
      lockedCash: 100_000,
      availableCash: 1_900_000,
      evaluationAmount: 1_000_000,
      purchaseAmount: 900_180,
      profitLoss: 99_820,
      profitRate: 11.09,
      cashRatio: 66.67,
      holdings: [
        expect.objectContaining({
          stockId: 1,
          qty: 500,
          sellableQty: 400,
          avgPrice: 1_000.2,
          currentPrice: 1_200,
          purchaseAmount: 500_100,
          evaluationAmount: 600_000,
          profitLoss: 99_900,
          profitRate: 19.98,
          assetRatio: 20,
        }),
        expect.objectContaining({
          stockId: 2,
          avgPrice: 1_000.2,
          currentPrice: 1_000,
          evaluationAmount: 400_000,
          profitLoss: -80,
          profitRate: -0.02,
          assetRatio: 13.33,
        }),
      ],
      baseTime: now,
    });
  });

  it('보유 종목이 없으면 총 자산은 예수금이고 수익률은 0이다', async () => {
    account.findUnique.mockResolvedValue({
      cash: 3_000_000n,
      lockedCash: 0n,
      holdings: [],
    });

    const result = await service.getPortfolio(7, now);

    expect(result).toMatchObject({
      totalAsset: 3_000_000,
      evaluationAmount: 0,
      purchaseAmount: 0,
      profitLoss: 0,
      profitRate: 0,
      cashRatio: 100,
      holdings: [],
    });
  });

  it('보유 종목은 평가금액이 큰 순서다', async () => {
    account.findUnique.mockResolvedValue({
      cash: 0n,
      lockedCash: 0n,
      holdings: [holdingOf(1, 10n, 10_000n), holdingOf(2, 30n, 30_000n)],
    });

    const result = await service.getPortfolio(7, now);

    expect(result.holdings.map(({ stockId }) => stockId)).toEqual([2, 1]);
    expect(result.cashRatio).toBe(0);
  });

  it('계좌가 없으면 404', async () => {
    account.findUnique.mockResolvedValue(null);

    await expect(service.getPortfolio(7, now)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_NOT_FOUND' },
    });
  });
});
