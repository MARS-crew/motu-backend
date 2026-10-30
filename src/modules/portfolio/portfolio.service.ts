import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { ChartsService } from '../charts/charts.service.js';
import {
  GetPortfolioResDto,
  PortfolioHoldingResDto,
} from './dto/res/get-portfolio-res.dto.js';

/** 비율(%)을 소수점 둘째 자리까지 반올림한다. 분모가 0이면 0이다. */
const percentOf = (part: bigint, whole: bigint): number =>
  whole === 0n ? 0 : Math.round((Number(part) / Number(whole)) * 10_000) / 100;

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chartsService: ChartsService,
  ) {}

  /**
   * 예수금과 보유 상품을 현재가로 평가한 포트폴리오.
   * 총 자산은 예수금(예약 포인트 포함) + 평가금액이고, 매입 금액은 매수 수수료를 포함한다.
   */
  async getPortfolio(
    userId: number,
    now: Date = new Date(),
  ): Promise<GetPortfolioResDto> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
      include: { holdings: { include: { stock: true } } },
    });
    if (!account) {
      throw new BusinessException(AccountErrors.NOT_FOUND);
    }

    const summaries = await this.chartsService.getDailySummaries(
      account.holdings.map(({ stock }) => stock),
      now,
    );
    const valued = account.holdings.map((holding) => {
      const summary = summaries.get(holding.stockId);
      const currentPrice = BigInt(
        summary?.currentPrice ?? holding.stock.basePrice,
      );
      return {
        holding,
        summary,
        currentPrice,
        evaluationAmount: currentPrice * holding.qty,
      };
    });

    const evaluationAmount = valued.reduce(
      (sum, { evaluationAmount }) => sum + evaluationAmount,
      0n,
    );
    const purchaseAmount = account.holdings.reduce(
      (sum, { totalAmount }) => sum + totalAmount,
      0n,
    );
    const totalAsset = account.cash + evaluationAmount;

    const holdings: PortfolioHoldingResDto[] = valued
      .sort(
        (a, b) =>
          Number(b.evaluationAmount - a.evaluationAmount) ||
          a.holding.stockId - b.holding.stockId,
      )
      .map(({ holding, summary, currentPrice, evaluationAmount }) => {
        const profitLoss = evaluationAmount - holding.totalAmount;
        return {
          stockId: holding.stockId,
          stockCode: holding.stock.stockCode,
          name: holding.stock.name,
          logoImageUrl: holding.stock.logoImageUrl,
          tradeStatus: holding.stock.tradeStatus,
          qty: Number(holding.qty),
          sellableQty: Number(holding.qty - holding.lockedQty),
          avgPrice:
            Math.round(
              (Number(holding.totalAmount) / Number(holding.qty)) * 100,
            ) / 100,
          currentPrice: Number(currentPrice),
          // 상품 목록과 같은 당일 시세. 체결이 없으면 0이다.
          changeAmount: summary?.changeAmount ?? 0,
          changeRate: summary?.changeRate ?? 0,
          volume: summary?.volume ?? 0,
          tradeAmount: summary?.tradeAmount ?? 0,
          listingDate: holding.stock.listingDate,
          purchaseAmount: Number(holding.totalAmount),
          evaluationAmount: Number(evaluationAmount),
          profitLoss: Number(profitLoss),
          profitRate: percentOf(profitLoss, holding.totalAmount),
          assetRatio: percentOf(evaluationAmount, totalAsset),
        };
      });

    const profitLoss = evaluationAmount - purchaseAmount;
    return {
      totalAsset: Number(totalAsset),
      cash: Number(account.cash),
      lockedCash: Number(account.lockedCash),
      availableCash: Number(account.cash - account.lockedCash),
      evaluationAmount: Number(evaluationAmount),
      purchaseAmount: Number(purchaseAmount),
      profitLoss: Number(profitLoss),
      profitRate: percentOf(profitLoss, purchaseAmount),
      cashRatio: percentOf(account.cash, totalAsset),
      holdings,
      baseTime: now,
    };
  }
}
