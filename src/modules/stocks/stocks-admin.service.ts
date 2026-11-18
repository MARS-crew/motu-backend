import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  OrderStatus,
  Prisma,
  Sector,
  Stock,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { ChartsService } from '../charts/charts.service.js';
import {
  StockTradingService,
  TradeStatusHooks,
} from '../matching/stock-trading.service.js';
import { GetDailySummaryResDto } from '../charts/dto/res/get-daily-summary-res.dto.js';
import { CloseStockReqDto } from './dto/req/close-stock-req.dto.js';
import { GetAdminStocksReqDto } from './dto/req/get-admin-stocks-req.dto.js';
import { PauseStockReqDto } from './dto/req/pause-stock-req.dto.js';
import { UpdateAdminStockReqDto } from './dto/req/update-admin-stock-req.dto.js';
import { ChangeTradeStatusResDto } from './dto/res/change-trade-status-res.dto.js';
import { GetAdminStockResDto } from './dto/res/get-admin-stock-res.dto.js';
import {
  AdminStockItemResDto,
  GetAdminStocksResDto,
} from './dto/res/get-admin-stocks-res.dto.js';
import { StockVisibility } from './stocks.constants.js';
import { StockErrors } from './stocks.errors.js';

type StockWithSector = Stock & { sector: Sector };

const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  [TradeStatus.PENDING]: '거래 대기',
  [TradeStatus.ACTIVE]: '거래 가능',
  [TradeStatus.PAUSED]: '거래 중지',
  [TradeStatus.CLOSED]: '거래 종료',
};

/** 정보 수정에서 변경 이력에 남기는 항목과 이름 */
const EDITABLE_FIELD_LABELS = {
  name: '상품명',
  sectorCode: '카테고리',
  isPublic: '노출 상태',
  summary: '한 줄 소개',
  description: '상품 소개',
  officialUrl: '공식 URL',
  mau: 'MAU',
  transactionVolume: '거래액',
  metricsBaseDate: '지표 기준일',
} as const;
type EditableField = keyof typeof EDITABLE_FIELD_LABELS;
type EditableValues = Record<EditableField, string | number | boolean | null>;

/** 관리자 처리를 남길 때 함께 받는 값 */
export interface StockAdminAction {
  adminId: number;
  client?: ClientInfo;
}

/** 상품 ID로 찾는 검색어. 예) 18, 018, PRD-018 */
const STOCK_ID_KEYWORD = /^(?:PRD-)?0*(\d{1,9})$/i;

/** 관리자 상품 관리. 사용자 노출 여부와 상관없이 삭제되지 않은 상품을 모두 다룬다. */
@Injectable()
export class StocksAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chartsService: ChartsService,
    private readonly stockTrading: StockTradingService,
    private readonly adminActivityLogs: AdminActivityLogsService,
  ) {}

  /** 상장 상품 목록. 최근 등록순이다. */
  async getStocks(query: GetAdminStocksReqDto): Promise<GetAdminStocksResDto> {
    const where = this.toWhere(query);
    const [stocks, totalCount] = await this.prisma.$transaction([
      this.prisma.stock.findMany({
        where,
        include: { sector: true },
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.stock.count({ where }),
    ]);
    const summaries = await this.chartsService.getDailySummaries(stocks);

    return {
      items: stocks.map((stock) => this.toItem(stock, summaries)),
      page: query.page,
      size: query.size,
      totalCount,
    };
  }

  /** 상장 상품 상세. 기본 정보, 거래 정보, 서비스 지표를 함께 내려준다. */
  async getStock(stockId: number): Promise<GetAdminStockResDto> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
      include: { sector: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }

    const [summaries, openOrderCount] = await Promise.all([
      this.chartsService.getDailySummaries([stock]),
      this.prisma.order.count({
        where: {
          stockId,
          status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
        },
      }),
    ]);

    return Object.assign(this.toItem(stock, summaries), {
      summary: stock.summary,
      description: stock.description,
      operatorName: stock.operatorName,
      officialUrl: stock.officialUrl,
      logoImageUrl: stock.logoImageUrl,
      mainImageUrl: stock.mainImageUrl,
      listedShares: Number(stock.listedShares),
      openOrderCount,
      statusNotice: stock.statusNotice,
      metrics: {
        mau: stock.mau === null ? null : Number(stock.mau),
        transactionVolume:
          stock.transactionVolume === null
            ? null
            : Number(stock.transactionVolume),
        // DATE 컬럼은 UTC 자정으로 읽히므로 날짜 부분만 내려준다.
        baseDate: stock.metricsEndDate?.toISOString().slice(0, 10) ?? null,
      },
    });
  }

  /**
   * 상품 기본 정보·노출 상태·서비스 지표를 바꾼다. 바뀐 항목만 저장하고, 변경 전·후와 사유를 활동 이력에 남긴다.
   * 거래 상태는 거래 중지·재개·종료로만 바꾼다.
   */
  async updateStock(
    stockId: number,
    dto: UpdateAdminStockReqDto,
    action: StockAdminAction,
  ): Promise<GetAdminStockResDto> {
    const stock = await this.findStock(stockId);
    const before = this.editableValuesOf(stock);
    const after: EditableValues = {
      name: dto.name,
      sectorCode: dto.sectorCode,
      isPublic: dto.isPublic,
      summary: dto.summary ?? before.summary,
      description:
        dto.description === undefined ? before.description : dto.description,
      officialUrl:
        dto.officialUrl === undefined ? before.officialUrl : dto.officialUrl,
      mau: dto.mau === undefined ? before.mau : dto.mau,
      transactionVolume:
        dto.transactionVolume === undefined
          ? before.transactionVolume
          : dto.transactionVolume,
      metricsBaseDate:
        dto.metricsBaseDate === undefined
          ? before.metricsBaseDate
          : dto.metricsBaseDate,
    };

    if (
      (after.mau !== null || after.transactionVolume !== null) &&
      after.metricsBaseDate === null
    ) {
      throw new BusinessException(StockErrors.METRICS_DATE_REQUIRED);
    }
    const changed = (
      Object.keys(EDITABLE_FIELD_LABELS) as EditableField[]
    ).filter((field) => before[field] !== after[field]);
    if (changed.length === 0) {
      throw new BusinessException(StockErrors.NOT_CHANGED);
    }
    if (changed.includes('sectorCode')) {
      const sector = await this.prisma.sector.findUnique({
        where: { code: dto.sectorCode },
      });
      if (!sector) {
        throw new BusinessException(StockErrors.SECTOR_NOT_FOUND);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.stock.update({
        where: { id: stockId },
        data: {
          name: after.name as string,
          sectorCode: after.sectorCode as number,
          isPublic: after.isPublic as boolean,
          summary: after.summary as string,
          description: after.description as string | null,
          officialUrl: after.officialUrl as string | null,
          mau: after.mau === null ? null : BigInt(after.mau),
          transactionVolume:
            after.transactionVolume === null
              ? null
              : BigInt(after.transactionVolume),
          metricsEndDate:
            after.metricsBaseDate === null
              ? null
              : new Date(after.metricsBaseDate as string),
        },
      });
      await this.adminActivityLogs.record(
        {
          adminId: action.adminId,
          targetType: AdminActivityTarget.STOCK,
          targetId: stockId,
          targetLabel: after.name as string,
          action: AdminActivityAction.STOCK_UPDATE,
          summary: `${changed.map((field) => EDITABLE_FIELD_LABELS[field]).join('·')} 수정`,
          before: Object.fromEntries(
            changed.map((field) => [field, before[field]]),
          ),
          after: Object.fromEntries(
            changed.map((field) => [field, after[field]]),
          ),
          reason: dto.reason,
          client: action.client,
        },
        tx,
      );
    });

    return this.getStock(stockId);
  }

  /** 거래 가능 상품의 거래를 중지한다. 미체결 주문은 취소되고 예약이 풀린다. */
  async pauseStock(
    stockId: number,
    dto: PauseStockReqDto,
    action: StockAdminAction,
  ): Promise<ChangeTradeStatusResDto> {
    const notice = dto.notice ?? null;
    return this.changeTradeStatus(stockId, TradeStatus.PAUSED, {
      allowedFrom: [TradeStatus.ACTIVE],
      activity: AdminActivityAction.STOCK_PAUSE,
      notice,
      reason: dto.reason,
      action,
      run: (hooks) => this.stockTrading.pauseStock(stockId, hooks),
    });
  }

  /** 거래 중지 상품의 거래를 다시 연다. 안내문은 지운다. */
  async resumeStock(
    stockId: number,
    reason: string,
    action: StockAdminAction,
  ): Promise<ChangeTradeStatusResDto> {
    return this.changeTradeStatus(stockId, TradeStatus.ACTIVE, {
      allowedFrom: [TradeStatus.PAUSED],
      activity: AdminActivityAction.STOCK_RESUME,
      notice: null,
      reason,
      action,
      run: async (hooks) => {
        await this.stockTrading.resumeStock(stockId, hooks);
        return { canceledCount: 0 };
      },
    });
  }

  /** 상품의 거래를 종료한다. 되돌릴 수 없고, 보유 수량은 그대로 남는다. */
  async closeStock(
    stockId: number,
    dto: CloseStockReqDto,
    action: StockAdminAction,
  ): Promise<ChangeTradeStatusResDto> {
    return this.changeTradeStatus(stockId, TradeStatus.CLOSED, {
      allowedFrom: [
        TradeStatus.PENDING,
        TradeStatus.ACTIVE,
        TradeStatus.PAUSED,
      ],
      activity: AdminActivityAction.STOCK_CLOSE,
      notice: dto.notice,
      reason: dto.reason,
      action,
      run: (hooks) => this.stockTrading.closeStock(stockId, hooks),
    });
  }

  /**
   * 거래 상태를 바꾼다. 상태 확인, 안내문 저장, 활동 이력 기록을 매칭의 거래 상태 변경과 같은 트랜잭션에서 한다.
   */
  private async changeTradeStatus(
    stockId: number,
    statusAfter: TradeStatus,
    change: {
      allowedFrom: TradeStatus[];
      activity: AdminActivityAction;
      notice: string | null;
      reason: string;
      action: StockAdminAction;
      run: (hooks: TradeStatusHooks) => Promise<{ canceledCount: number }>;
    },
  ): Promise<ChangeTradeStatusResDto> {
    let statusBefore: TradeStatus | undefined;
    const { canceledCount } = await change.run({
      check: (stock) => {
        if (!change.allowedFrom.includes(stock.tradeStatus)) {
          throw new BusinessException(
            StockErrors.INVALID_TRADE_STATUS,
            undefined,
            { tradeStatus: stock.tradeStatus },
          );
        }
        statusBefore = stock.tradeStatus;
      },
      afterChange: async (tx, { stock, canceledCount }) => {
        await tx.stock.update({
          where: { id: stockId },
          data: { statusNotice: change.notice },
        });
        await this.adminActivityLogs.record(
          {
            adminId: change.action.adminId,
            targetType: AdminActivityTarget.STOCK,
            targetId: stockId,
            targetLabel: stock.name,
            action: change.activity,
            summary: `${TRADE_STATUS_LABELS[stock.tradeStatus]} → ${TRADE_STATUS_LABELS[statusAfter]}`,
            before: {
              tradeStatus: stock.tradeStatus,
              statusNotice: stock.statusNotice,
            },
            after: {
              tradeStatus: statusAfter,
              statusNotice: change.notice,
              canceledOrderCount: canceledCount,
            },
            reason: change.reason,
            client: change.action.client,
          },
          tx,
        );
      },
    });

    return {
      stockId,
      statusBefore: statusBefore!,
      statusAfter,
      canceledOrderCount: canceledCount,
    };
  }

  private async findStock(stockId: number): Promise<Stock> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }
    return stock;
  }

  private editableValuesOf(stock: Stock): EditableValues {
    return {
      name: stock.name,
      sectorCode: stock.sectorCode,
      isPublic: stock.isPublic,
      summary: stock.summary,
      description: stock.description,
      officialUrl: stock.officialUrl,
      mau: stock.mau === null ? null : Number(stock.mau),
      transactionVolume:
        stock.transactionVolume === null
          ? null
          : Number(stock.transactionVolume),
      // DATE 컬럼은 UTC 자정으로 읽히므로 날짜 부분만 비교한다.
      metricsBaseDate: stock.metricsEndDate?.toISOString().slice(0, 10) ?? null,
    };
  }

  private toWhere(query: GetAdminStocksReqDto): Prisma.StockWhereInput {
    const idMatch = query.keyword?.match(STOCK_ID_KEYWORD);
    return {
      isDeleted: false,
      tradeStatus: query.tradeStatus,
      sectorCode: query.sectorCode,
      isPublic: query.visibility
        ? query.visibility === StockVisibility.PUBLIC
        : undefined,
      OR: query.keyword
        ? [
            { name: { contains: query.keyword, mode: 'insensitive' } },
            { stockCode: { contains: query.keyword, mode: 'insensitive' } },
            ...(idMatch ? [{ id: Number(idMatch[1]) }] : []),
          ]
        : undefined,
    };
  }

  private toItem(
    stock: StockWithSector,
    summaries: Map<number, GetDailySummaryResDto>,
  ): AdminStockItemResDto {
    return {
      stockId: stock.id,
      stockCode: stock.stockCode,
      name: stock.name,
      sectorCode: stock.sectorCode,
      sectorName: stock.sector.name,
      tradeStatus: stock.tradeStatus,
      isPublic: stock.isPublic,
      listingDate: stock.listingDate,
      // 거래 시작 전에는 체결가가 없어 기준가가 나오므로 비워 둔다.
      currentPrice:
        stock.tradeStatus === TradeStatus.PENDING
          ? null
          : (summaries.get(stock.id)?.currentPrice ?? null),
    };
  }
}
