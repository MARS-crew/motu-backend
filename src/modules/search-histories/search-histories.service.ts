import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { GetSearchHistoriesResDto } from './dto/res/get-search-histories-res.dto.js';
import { MAX_SEARCH_HISTORIES } from './search-histories.constants.js';
import { SearchHistoryErrors } from './search-histories.errors.js';

@Injectable()
export class SearchHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 검색어를 남긴다. 같은 검색어는 새로 만들지 않고 맨 위로 올리며, 최근 5개를 넘는 검색어는 지운다.
   */
  async record(userId: number, keyword: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.searchHistory.upsert({
        where: { userId_keyword: { userId, keyword } },
        create: { userId, keyword, createDate: now, modifiedDate: now },
        update: { modifiedDate: now },
      });

      const overflow = await tx.searchHistory.findMany({
        where: { userId },
        orderBy: [{ modifiedDate: 'desc' }, { id: 'desc' }],
        skip: MAX_SEARCH_HISTORIES,
        select: { id: true },
      });
      if (overflow.length > 0) {
        await tx.searchHistory.deleteMany({
          where: { id: { in: overflow.map(({ id }) => id) } },
        });
      }
    });
  }

  async getSearchHistories(userId: number): Promise<GetSearchHistoriesResDto> {
    const histories = await this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: [{ modifiedDate: 'desc' }, { id: 'desc' }],
      take: MAX_SEARCH_HISTORIES,
    });
    return {
      items: histories.map((history) => ({
        searchHistoryId: history.id,
        keyword: history.keyword,
        searchedAt: history.modifiedDate,
      })),
    };
  }

  async deleteSearchHistory(userId: number, id: number): Promise<void> {
    const { count } = await this.prisma.searchHistory.deleteMany({
      where: { id, userId },
    });
    if (count === 0) {
      throw new BusinessException(SearchHistoryErrors.NOT_FOUND);
    }
  }

  async clearSearchHistories(userId: number): Promise<void> {
    await this.prisma.searchHistory.deleteMany({ where: { userId } });
  }
}
