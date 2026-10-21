import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma, Sector, Stock } from '../../generated/prisma/client.js';
import { SearchHistoriesService } from '../search-histories/search-histories.service.js';
import { GetNewListingsResDto } from './dto/res/get-new-listings-res.dto.js';
import {
  GetStocksResDto,
  StockItemResDto,
} from './dto/res/get-stocks-res.dto.js';
import { NEW_LISTING_BADGE_MS, StockSort } from './stocks.constants.js';
import { StockErrors } from './stocks.errors.js';

type StockWithSector = Stock & { sector: Sector };

interface StockPageQuery {
  where: Prisma.StockWhereInput;
  sort: StockSort;
  cursor?: string;
  size: number;
}

/** 커서에 담는 값. 정렬이 바뀌면 이전 커서는 쓸 수 없다. */
interface StockCursor {
  sort: StockSort;
  listingDate: string;
  id: number;
}

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchHistoriesService: SearchHistoriesService,
  ) {}

  async getStocks(query: {
    sectorCode?: number;
    sort: StockSort;
    cursor?: string;
    size: number;
  }): Promise<GetStocksResDto> {
    const { items, nextCursor } = await this.findPage({
      where: query.sectorCode ? { sectorCode: query.sectorCode } : {},
      sort: query.sort,
      cursor: query.cursor,
      size: query.size,
    });
    return { items: items.map((stock) => this.toItem(stock)), nextCursor };
  }

  /**
   * 상품명·카테고리명 부분 일치로 검색한다. 로그인한 회원이면 첫 페이지를 조회할 때 검색어를 남긴다.
   */
  async searchStocks(
    userId: number | undefined,
    query: { keyword: string; cursor?: string; size: number },
  ): Promise<GetStocksResDto> {
    const { keyword } = query;
    const { items, nextCursor } = await this.findPage({
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

    return { items: items.map((stock) => this.toItem(stock)), nextCursor };
  }

  async getNewListings(query: {
    cursor?: string;
    size: number;
  }): Promise<GetNewListingsResDto> {
    const { items, nextCursor } = await this.findPage({
      where: {},
      sort: StockSort.LISTING_DATE,
      cursor: query.cursor,
      size: query.size,
    });
    const newSince = Date.now() - NEW_LISTING_BADGE_MS;
    return {
      items: items.map((stock) =>
        Object.assign(this.toItem(stock), {
          summary: stock.summary,
          isNew: stock.listingDate.getTime() > newSince,
        }),
      ),
      nextCursor,
    };
  }

  /**
   * 삭제되지 않은 상품을 커서 페이지로 조회한다. 거래 종료 상품도 포함한다.
   * 현재가·등락률·거래량·거래대금은 체결 데이터가 생기면 정렬 기준에 반영한다.
   * 그 전에는 모든 정렬이 최근 상장순과 같다.
   */
  private async findPage(
    query: StockPageQuery,
  ): Promise<{ items: StockWithSector[]; nextCursor: string | null }> {
    const after = query.cursor
      ? this.decodeCursor(query.cursor, query.sort)
      : undefined;

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
      nextCursor: hasNext && last ? this.encodeCursor(query.sort, last) : null,
    };
  }

  private encodeCursor(sort: StockSort, stock: Stock): string {
    const cursor: StockCursor = {
      sort,
      listingDate: stock.listingDate.toISOString(),
      id: stock.id,
    };
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(
    value: string,
    sort: StockSort,
  ): { listingDate: Date; id: number } {
    try {
      const cursor = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<StockCursor>;
      const listingDate = new Date(cursor.listingDate ?? '');
      if (
        cursor.sort === sort &&
        Number.isInteger(cursor.id) &&
        !Number.isNaN(listingDate.getTime())
      ) {
        return { listingDate, id: cursor.id! };
      }
    } catch {
      // 아래에서 공통으로 처리한다.
    }
    throw new BusinessException(StockErrors.INVALID_CURSOR);
  }

  /** 체결 데이터가 생기기 전까지 현재가는 기준가, 나머지 시세 값은 0이다. */
  private toItem(stock: StockWithSector): StockItemResDto {
    return {
      stockId: stock.id,
      stockCode: stock.stockCode,
      name: stock.name,
      sectorCode: stock.sectorCode,
      sectorName: stock.sector.name,
      logoImageUrl: stock.logoImageUrl,
      currentPrice: Number(stock.basePrice),
      changeAmount: 0,
      changeRate: 0,
      volume: 0,
      tradeAmount: 0,
      listingDate: stock.listingDate,
      tradeStatus: stock.tradeStatus,
    };
  }
}
