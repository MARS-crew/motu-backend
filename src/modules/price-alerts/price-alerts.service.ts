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

/** PostgreSQL INT 최댓값 */
const INT_MAX = 2_147_483_647;

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

  /**
   * 설정 가격을 바꾸고 알림을 다시 켠다. 이미 울린 알림도 다시 울릴 수 있게 된다.
   */
  async updateAlert(
    userId: number,
    alertId: number,
    targetPriceValue: number,
  ): Promise<PriceAlertResDto> {
    const targetPrice = BigInt(targetPriceValue);
    this.assertAlertId(alertId);
    const owned = await this.prisma.priceAlert.findFirst({
      where: { id: alertId, userId },
      include: { stock: { select: ALERT_STOCK_SELECT } },
    });
    if (!owned) {
      throw new BusinessException(PriceAlertErrors.NOT_FOUND);
    }
    const currentPrice = await this.currentPriceOf(owned.stock);
    this.validateTarget(owned.stock, targetPrice, currentPrice);

    // version을 올려 이전 설정으로 감지 중인 도달은 반영되지 않게 한다.
    const alert = await this.withDuplicateCheck(() =>
      this.prisma.priceAlert.update({
        where: { id: owned.id },
        data: {
          targetPrice,
          isActive: true,
          triggeredDate: null,
          version: { increment: 1 },
        },
      }),
    );
    return this.toRes({ ...alert, stock: owned.stock }, currentPrice);
  }

  /**
   * 알림을 해제(삭제)한다. 이미 울린 알림 내역은 알림 목록에 그대로 남는다.
   */
  async deleteAlert(userId: number, alertId: number): Promise<void> {
    this.assertAlertId(alertId);
    const { count } = await this.prisma.priceAlert.deleteMany({
      where: { id: alertId, userId },
    });
    if (count === 0) {
      throw new BusinessException(PriceAlertErrors.NOT_FOUND);
    }
  }

  /** INT 범위를 벗어난 ID는 DB 에러 대신 없는 알림으로 처리한다. */
  private assertAlertId(alertId: number): void {
    if (alertId < 1 || alertId > INT_MAX) {
      throw new BusinessException(PriceAlertErrors.NOT_FOUND);
    }
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
