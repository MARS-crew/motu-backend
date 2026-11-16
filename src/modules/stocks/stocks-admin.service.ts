import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderStatus,
  Prisma,
  Sector,
  Stock,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { ChartsService } from '../charts/charts.service.js';
import { GetDailySummaryResDto } from '../charts/dto/res/get-daily-summary-res.dto.js';
import { GetAdminStocksReqDto } from './dto/req/get-admin-stocks-req.dto.js';
import { GetAdminStockResDto } from './dto/res/get-admin-stock-res.dto.js';
import {
  AdminStockItemResDto,
  GetAdminStocksResDto,
} from './dto/res/get-admin-stocks-res.dto.js';
import { StockVisibility } from './stocks.constants.js';
import { StockErrors } from './stocks.errors.js';

type StockWithSector = Stock & { sector: Sector };

/** 상품 ID로 찾는 검색어. 예) 18, 018, PRD-018 */
const STOCK_ID_KEYWORD = /^(?:PRD-)?0*(\d{1,9})$/i;

/** 관리자 상품 관리. 사용자 노출 여부와 상관없이 삭제되지 않은 상품을 모두 다룬다. */
@Injectable()
export class StocksAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chartsService: ChartsService,
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
