import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma, Sector, Stock } from '../../generated/prisma/client.js';
import { ChartsService } from '../charts/charts.service.js';
import { GetDailySummaryResDto } from '../charts/dto/res/get-daily-summary-res.dto.js';
import { SearchHistoriesService } from '../search-histories/search-histories.service.js';
import { GetNewListingsResDto } from './dto/res/get-new-listings-res.dto.js';
import { GetRecentlyViewedResDto } from './dto/res/get-recently-viewed-res.dto.js';
import { GetStockResDto } from './dto/res/get-stock-res.dto.js';
import { GetWishlistsResDto } from './dto/res/get-wishlists-res.dto.js';
import {
  GetStocksResDto,
  StockItemResDto,
} from './dto/res/get-stocks-res.dto.js';
import {
  MAX_VIEW_HISTORIES,
  NEW_LISTING_BADGE_MS,
  StockSort,
} from './stocks.constants.js';
import { StockErrors } from './stocks.errors.js';

type StockWithSector = Stock & { sector: Sector };

/** 상품 ID별 당일 시세 */
type Summaries = Map<number, GetDailySummaryResDto>;

/** 시세 값으로 정렬하는 기준과 그 값. 최근 상장순은 DB에서 정렬한다. */
const MARKET_SORT_KEYS: Partial<
  Record<StockSort, { key: keyof GetDailySummaryResDto; desc: boolean }>
> = {
  [StockSort.TRADE_AMOUNT]: { key: 'tradeAmount', desc: true },
  [StockSort.CHANGE_RATE_DESC]: { key: 'changeRate', desc: true },
  [StockSort.CHANGE_RATE_ASC]: { key: 'changeRate', desc: false },
  [StockSort.VOLUME]: { key: 'volume', desc: true },
};

interface StockPageQuery {
  where: Prisma.StockWhereInput;
  sort: StockSort;
  cursor?: string;
  size: number;
}

/** 관심 상품 목록 커서에 담는 값 */
interface WishlistCursor {
  createDate: string;
  stockId: number;
}

/** 커서에 담는 값. 정렬이 바뀌면 이전 커서는 쓸 수 없다. */
interface StockCursor {
  sort: StockSort;
  /** 시세 기준 정렬일 때 마지막 상품의 정렬 값 */
  value?: number;
  listingDate: string;
  id: number;
}

/** 페이지 위치를 비교하는 값 */
interface StockPosition {
  value?: number;
  listingDate: Date;
  id: number;
}

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchHistoriesService: SearchHistoriesService,
    private readonly chartsService: ChartsService,
  ) {}

  async getStocks(
    userId: number | undefined,
    query: {
      sectorCode?: number;
      sort: StockSort;
      cursor?: string;
      size: number;
    },
  ): Promise<GetStocksResDto> {
    const { items, summaries, nextCursor } = await this.findPage({
      where: query.sectorCode ? { sectorCode: query.sectorCode } : {},
      sort: query.sort,
      cursor: query.cursor,
      size: query.size,
    });
    const wishlisted = await this.findWishlisted(userId, items);
    return {
      items: items.map((stock) => this.toItem(stock, wishlisted, summaries)),
      nextCursor,
    };
  }

  /**
   * 상품명·카테고리명 부분 일치로 검색한다. 로그인한 회원이면 첫 페이지를 조회할 때 검색어를 남긴다.
   */
  async searchStocks(
    userId: number | undefined,
    query: { keyword: string; cursor?: string; size: number },
  ): Promise<GetStocksResDto> {
    const { keyword } = query;
    const { items, summaries, nextCursor } = await this.findPage({
      where: {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { sector: { name: { contains: keyword, mode: 'insensitive' } } },
        ],
      },
      sort: StockSort.TRADE_AMOUNT,
      cursor: query.cursor,
      size: query.size,
    });

    if (userId !== undefined && !query.cursor) {
      await this.searchHistoriesService.record(userId, keyword);
    }

    const wishlisted = await this.findWishlisted(userId, items);
    return {
      items: items.map((stock) => this.toItem(stock, wishlisted, summaries)),
      nextCursor,
    };
  }

  async getNewListings(
    userId: number | undefined,
    query: { cursor?: string; size: number },
  ): Promise<GetNewListingsResDto> {
    const { items, summaries, nextCursor } = await this.findPage({
      where: {},
      sort: StockSort.LISTING_DATE,
      cursor: query.cursor,
      size: query.size,
    });
    const wishlisted = await this.findWishlisted(userId, items);
    const newSince = Date.now() - NEW_LISTING_BADGE_MS;
    return {
      items: items.map((stock) =>
        Object.assign(this.toItem(stock, wishlisted, summaries), {
          summary: stock.summary,
          isNew: stock.listingDate.getTime() > newSince,
        }),
      ),
      nextCursor,
    };
  }

  /**
   * 상품 상세. 거래 종료 상품도 볼 수 있다. 로그인한 회원이면 최근 본 종목에 남긴다.
   */
  async getStock(
    userId: number | undefined,
    stockId: number,
  ): Promise<GetStockResDto> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
      include: { sector: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }

    if (userId !== undefined) {
      await this.recordView(userId, stock.id);
    }

    const wishlisted = await this.findWishlisted(userId, [stock]);
    const summaries = await this.chartsService.getDailySummaries([stock]);
    const { currentPrice, changeAmount, changeRate, isWishlisted } =
      this.toItem(stock, wishlisted, summaries);
    return {
      stockId: stock.id,
      stockCode: stock.stockCode,
      name: stock.name,
      summary: stock.summary,
      description: stock.description,
      sectorCode: stock.sectorCode,
      sectorName: stock.sector.name,
      logoImageUrl: stock.logoImageUrl,
      mainImageUrl: stock.mainImageUrl,
      officialUrl: stock.officialUrl,
      operatorName: stock.operatorName,
      metrics: {
        mau: this.toNumberOrNull(stock.mau),
        dau: this.toNumberOrNull(stock.dau),
        revenue: this.toNumberOrNull(stock.revenue),
        transactionVolume: this.toNumberOrNull(stock.transactionVolume),
        startDate: this.toDateOrNull(stock.metricsStartDate),
        endDate: this.toDateOrNull(stock.metricsEndDate),
      },
      listingDate: stock.listingDate,
      tradeStatus: stock.tradeStatus,
      currentPrice,
      changeAmount,
      changeRate,
      isWishlisted,
    };
  }

  /** 최근 본 종목을 최근 본 순서로 최대 3개 내려준다. 삭제된 상품은 뺀다. */
  async getRecentlyViewed(userId: number): Promise<GetRecentlyViewedResDto> {
    const histories = await this.prisma.viewHistory.findMany({
      where: { userId, stock: { isDeleted: false } },
      include: { stock: { include: { sector: true } } },
      orderBy: { modifiedDate: 'desc' },
      take: MAX_VIEW_HISTORIES,
    });
    const stocks = histories.map(({ stock }) => stock);
    const wishlisted = await this.findWishlisted(userId, stocks);
    const summaries = await this.chartsService.getDailySummaries(stocks);
    return {
      items: stocks.map((stock) => this.toItem(stock, wishlisted, summaries)),
    };
  }

  /** 관심상품으로 등록한다. 이미 등록되어 있어도 성공으로 처리한다. */
  async addWishlist(userId: number, stockId: number): Promise<void> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
      select: { id: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }

    await this.prisma.wishlist.upsert({
      where: { userId_stockId: { userId, stockId } },
      create: { userId, stockId },
      update: {},
    });
  }

  /** 관심상품에서 뺀다. 등록되어 있지 않아도 성공으로 처리한다. */
  async removeWishlist(userId: number, stockId: number): Promise<void> {
    await this.prisma.wishlist.deleteMany({ where: { userId, stockId } });
  }

  /** 관심 상품 목록. 최근에 추가한 순서이며 삭제된 상품은 뺀다. */
  async getWishlists(
    userId: number,
    query: { cursor?: string; size: number },
  ): Promise<GetWishlistsResDto> {
    const after = query.cursor
      ? this.decodeWishlistCursor(query.cursor)
      : undefined;

    const wishlists = await this.prisma.wishlist.findMany({
      where: {
        userId,
        stock: { isDeleted: false },
        ...(after && {
          OR: [
            { createDate: { lt: after.createDate } },
            { createDate: after.createDate, stockId: { lt: after.stockId } },
          ],
        }),
      },
      include: { stock: { include: { sector: true } } },
      orderBy: [{ createDate: 'desc' }, { stockId: 'desc' }],
      take: query.size + 1,
    });

    const hasNext = wishlists.length > query.size;
    const page = hasNext ? wishlists.slice(0, query.size) : wishlists;
    const last = page.at(-1);
    const wishlisted = new Set(page.map(({ stockId }) => stockId));
    const summaries = await this.chartsService.getDailySummaries(
      page.map(({ stock }) => stock),
    );
    return {
      items: page.map(({ stock }) => this.toItem(stock, wishlisted, summaries)),
      nextCursor:
        hasNext && last
          ? this.encode({
              createDate: last.createDate.toISOString(),
              stockId: last.stockId,
            } satisfies WishlistCursor)
          : null,
    };
  }

  /** 비회원이면 빈 집합이다. */
  private async findWishlisted(
    userId: number | undefined,
    stocks: Stock[],
  ): Promise<Set<number>> {
    if (userId === undefined || stocks.length === 0) {
      return new Set();
    }
    const wishlists = await this.prisma.wishlist.findMany({
      where: { userId, stockId: { in: stocks.map(({ id }) => id) } },
      select: { stockId: true },
    });
    return new Set(wishlists.map(({ stockId }) => stockId));
  }

  /**
   * 최근 본 종목을 남긴다. 같은 상품은 맨 위로 올리고, 최근 3개를 넘는 기록은 지운다.
   */
  private async recordView(userId: number, stockId: number): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.viewHistory.upsert({
        where: { userId_stockId: { userId, stockId } },
        create: { userId, stockId, createDate: now, modifiedDate: now },
        update: { modifiedDate: now },
      });

      const overflow = await tx.viewHistory.findMany({
        where: { userId },
        orderBy: { modifiedDate: 'desc' },
        skip: MAX_VIEW_HISTORIES,
        select: { stockId: true },
      });
      if (overflow.length > 0) {
        await tx.viewHistory.deleteMany({
          where: {
            userId,
            stockId: { in: overflow.map((history) => history.stockId) },
          },
        });
      }
    });
  }

  private toNumberOrNull(value: bigint | null): number | null {
    return value === null ? null : Number(value);
  }

  /** DATE 컬럼은 UTC 자정으로 읽히므로 날짜 부분만 내려준다. */
  private toDateOrNull(value: Date | null): string | null {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  /**
   * 삭제되지 않은 상품을 커서 페이지로 조회한다. 거래 종료 상품도 포함한다.
   * 최근 상장순은 DB에서 정렬하고, 시세 기준 정렬은 당일 시세를 계산한 뒤 정렬한다.
   */
  private async findPage(query: StockPageQuery): Promise<{
    items: StockWithSector[];
    summaries: Summaries;
    nextCursor: string | null;
  }> {
    const after = query.cursor
      ? this.decodeCursor(query.cursor, query.sort)
      : undefined;
    return MARKET_SORT_KEYS[query.sort]
      ? this.findPageByMarket(query, after)
      : this.findPageByListingDate(query, after);
  }

  private async findPageByListingDate(
    query: StockPageQuery,
    after: StockPosition | undefined,
  ): Promise<{
    items: StockWithSector[];
    summaries: Summaries;
    nextCursor: string | null;
  }> {
    const stocks = await this.prisma.stock.findMany({
      where: {
        AND: [
          query.where,
          { isDeleted: false },
          after
            ? {
                OR: [
                  { listingDate: { lt: after.listingDate } },
                  { listingDate: after.listingDate, id: { lt: after.id } },
                ],
              }
            : {},
        ],
      },
      include: { sector: true },
      orderBy: [{ listingDate: 'desc' }, { id: 'desc' }],
      take: query.size + 1,
    });

    const hasNext = stocks.length > query.size;
    const items = hasNext ? stocks.slice(0, query.size) : stocks;
    const last = items.at(-1);
    return {
      items,
      summaries: await this.chartsService.getDailySummaries(items),
      nextCursor:
        hasNext && last
          ? this.encodeCursor(query.sort, { ...last, value: undefined })
          : null,
    };
  }

  /**
   * 시세 값(거래대금·등락률·거래량)으로 정렬한다. 값은 체결마다 바뀌어 DB에 정렬 컬럼이 없으므로,
   * 조건에 맞는 상품 전체의 당일 시세를 구해 메모리에서 정렬한다. 같은 값이면 최근 상장순이다.
   * 상품 수가 수백 개를 넘으면 시세 값을 상품 행에 저장해 DB에서 정렬하는 방식으로 바꾼다.
   */
  private async findPageByMarket(
    query: StockPageQuery,
    after: StockPosition | undefined,
  ): Promise<{
    items: StockWithSector[];
    summaries: Summaries;
    nextCursor: string | null;
  }> {
    const { key, desc } = MARKET_SORT_KEYS[query.sort]!;
    const stocks = await this.prisma.stock.findMany({
      where: { AND: [query.where, { isDeleted: false }] },
      include: { sector: true },
    });
    const summaries = await this.chartsService.getDailySummaries(stocks);
    const positionOf = (stock: StockWithSector): StockPosition => ({
      value: summaries.get(stock.id)![key] as number,
      listingDate: stock.listingDate,
      id: stock.id,
    });
    const compare = (a: StockPosition, b: StockPosition): number =>
      (desc ? b.value! - a.value! : a.value! - b.value!) ||
      b.listingDate.getTime() - a.listingDate.getTime() ||
      b.id - a.id;

    const sorted = stocks
      .map((stock) => ({ stock, position: positionOf(stock) }))
      .sort((a, b) => compare(a.position, b.position));
    const rest = after
      ? sorted.filter(({ position }) => compare(position, after) > 0)
      : sorted;

    const hasNext = rest.length > query.size;
    const page = rest.slice(0, query.size);
    const last = page.at(-1);
    return {
      items: page.map(({ stock }) => stock),
      summaries,
      nextCursor:
        hasNext && last ? this.encodeCursor(query.sort, last.position) : null,
    };
  }

  private encodeCursor(sort: StockSort, position: StockPosition): string {
    return this.encode({
      sort,
      value: position.value,
      listingDate: position.listingDate.toISOString(),
      id: position.id,
    } satisfies StockCursor);
  }

  private decodeCursor(value: string, sort: StockSort): StockPosition {
    const cursor = this.decode<StockCursor>(value);
    const listingDate = new Date(cursor.listingDate ?? '');
    const needsValue = MARKET_SORT_KEYS[sort] !== undefined;
    if (
      cursor.sort !== sort ||
      !Number.isInteger(cursor.id) ||
      Number.isNaN(listingDate.getTime()) ||
      (needsValue && !Number.isFinite(cursor.value))
    ) {
      throw new BusinessException(StockErrors.INVALID_CURSOR);
    }
    return { value: cursor.value, listingDate, id: cursor.id! };
  }

  private decodeWishlistCursor(value: string): {
    createDate: Date;
    stockId: number;
  } {
    const cursor = this.decode<WishlistCursor>(value);
    const createDate = new Date(cursor.createDate ?? '');
    if (
      !Number.isInteger(cursor.stockId) ||
      Number.isNaN(createDate.getTime())
    ) {
      throw new BusinessException(StockErrors.INVALID_CURSOR);
    }
    return { createDate, stockId: cursor.stockId! };
  }

  private encode(cursor: object): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decode<T>(value: string): Partial<T> {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      );
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Partial<T>;
      }
    } catch {
      // 아래에서 공통으로 처리한다.
    }
    throw new BusinessException(StockErrors.INVALID_CURSOR);
  }

  /** 체결이 없는 상품은 현재가가 기준가이고, 나머지 시세 값은 0이다. */
  private toItem(
    stock: StockWithSector,
    wishlisted: Set<number>,
    summaries: Summaries,
  ): StockItemResDto {
    const summary = summaries.get(stock.id);
    return {
      stockId: stock.id,
      stockCode: stock.stockCode,
      name: stock.name,
      sectorCode: stock.sectorCode,
      sectorName: stock.sector.name,
      logoImageUrl: stock.logoImageUrl,
      currentPrice: summary?.currentPrice ?? Number(stock.basePrice),
      changeAmount: summary?.changeAmount ?? 0,
      changeRate: summary?.changeRate ?? 0,
      volume: summary?.volume ?? 0,
      tradeAmount: summary?.tradeAmount ?? 0,
      listingDate: stock.listingDate,
      tradeStatus: stock.tradeStatus,
      isWishlisted: wishlisted.has(stock.id),
    };
  }
}
