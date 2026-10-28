import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  PriceAlert,
  Prisma,
  Stock,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { ChartsService } from '../charts/charts.service.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { CreatePriceAlertReqDto } from './dto/req/create-price-alert-req.dto.js';
import { PriceAlertResDto } from './dto/res/price-alert-res.dto.js';
import { PriceAlertErrors } from './price-alerts.errors.js';

/** 알림을 설정·수정할 수 있는 상품 상태. 거래 중지 중에도 미리 걸어 둘 수 있다. */
const ALERTABLE_STATUSES: TradeStatus[] = [
  TradeStatus.ACTIVE,
  TradeStatus.PAUSED,
];

type AlertStock = Pick<
  Stock,
  | 'id'
  | 'name'
  | 'basePrice'
  | 'tradeStatus'
  | 'priceTickSize'
  | 'minOrderPrice'
>;

const ALERT_STOCK_SELECT = {
  id: true,
  name: true,
  basePrice: true,
  tradeStatus: true,
  priceTickSize: true,
  minOrderPrice: true,
} as const satisfies Prisma.StockSelect;

type PriceAlertWithStock = PriceAlert & { stock: AlertStock };

@Injectable()
export class PriceAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charts: ChartsService,
  ) {}

  /**
   * 지정가 알림을 등록한다. 체결가가 설정 가격에 처음 도달하면 한 번 알린다.
   */
  async createAlert(
    userId: number,
    dto: CreatePriceAlertReqDto,
  ): Promise<PriceAlertResDto> {
    const targetPrice = BigInt(dto.targetPrice);
    const stock = await this.prisma.stock.findFirst({
      where: { id: dto.stockId, isDeleted: false },
      select: ALERT_STOCK_SELECT,
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    const currentPrice = await this.currentPriceOf(stock);
    this.validateTarget(stock, targetPrice, currentPrice);

    const alert = await this.withDuplicateCheck(() =>
      this.prisma.priceAlert.create({
        data: { userId, stockId: stock.id, targetPrice },
      }),
    );
    return this.toRes({ ...alert, stock }, currentPrice);
  }

  private async currentPriceOf(stock: AlertStock): Promise<bigint> {
    const summaries = await this.charts.getDailySummaries([stock]);
    return BigInt(summaries.get(stock.id)!.currentPrice);
  }

  /**
   * 상품 상태와 설정 가격을 확인한다. 가격 규칙은 주문과 같다(호가 단위, 최소 주문 가격).
   */
  private validateTarget(
    stock: AlertStock,
    targetPrice: bigint,
    currentPrice: bigint,
  ): void {
    if (!ALERTABLE_STATUSES.includes(stock.tradeStatus)) {
      throw new BusinessException(
        PriceAlertErrors.STOCK_NOT_ALERTABLE,
        undefined,
        { tradeStatus: stock.tradeStatus },
      );
    }
    if (targetPrice % stock.priceTickSize !== 0n) {
      throw new BusinessException(
        PriceAlertErrors.INVALID_PRICE_TICK,
        undefined,
        { priceTickSize: Number(stock.priceTickSize) },
      );
    }
    if (targetPrice < stock.minOrderPrice) {
      throw new BusinessException(PriceAlertErrors.PRICE_TOO_LOW, undefined, {
        minOrderPrice: Number(stock.minOrderPrice),
      });
    }
    if (targetPrice === currentPrice) {
      throw new BusinessException(
        PriceAlertErrors.SAME_AS_CURRENT_PRICE,
        undefined,
        { currentPrice: Number(currentPrice) },
      );
    }
  }

  /** 같은 상품에 같은 가격의 알림이 있으면(unique 위반) 중복 에러로 바꾼다. */
  private async withDuplicateCheck<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BusinessException(PriceAlertErrors.DUPLICATE);
      }
      throw error;
    }
  }

  private toRes(
    alert: PriceAlertWithStock,
    currentPrice: bigint,
  ): PriceAlertResDto {
    return {
      alertId: alert.id,
      stockId: alert.stockId,
      stockName: alert.stock.name,
      targetPrice: Number(alert.targetPrice),
      currentPrice: Number(currentPrice),
      isActive: alert.isActive,
      triggeredDate: alert.triggeredDate,
      createDate: alert.createDate,
    };
  }
}
