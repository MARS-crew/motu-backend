import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetSearchHistoriesResDto } from './dto/res/get-search-histories-res.dto.js';
import { SearchHistoriesService } from './search-histories.service.js';

@ApiTags('Search Histories')
@ApiBearerAuth()
@Controller('search-histories')
export class SearchHistoriesController {
  constructor(
    private readonly searchHistoriesService: SearchHistoriesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '최근 검색어 조회',
    description:
      '최근 검색순으로 최대 5개. 검색어는 상품 검색 API를 호출할 때 저장된다.',
  })
  @ApiOkResponse({ type: GetSearchHistoriesResDto })
  getSearchHistories(
    @CurrentUser() user: AuthUser,
  ): Promise<GetSearchHistoriesResDto> {
    return this.searchHistoriesService.getSearchHistories(user.userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '최근 검색어 전체 삭제' })
  @ApiNoContentResponse()
  clearSearchHistories(@CurrentUser() user: AuthUser): Promise<void> {
    return this.searchHistoriesService.clearSearchHistories(user.userId);
  }

  @Delete(':searchHistoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '최근 검색어 개별 삭제' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'SEARCH_HISTORY_NOT_FOUND' })
  deleteSearchHistory(
    @CurrentUser() user: AuthUser,
    @Param('searchHistoryId', ParseIdPipe) searchHistoryId: number,
  ): Promise<void> {
    return this.searchHistoriesService.deleteSearchHistory(
      user.userId,
      searchHistoryId,
    );
  }
}
