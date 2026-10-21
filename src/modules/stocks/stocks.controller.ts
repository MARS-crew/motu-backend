import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { OptionalAuth } from '../../common/auth/optional-auth.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { GetNewListingsReqDto } from './dto/req/get-new-listings-req.dto.js';
import { GetStocksReqDto } from './dto/req/get-stocks-req.dto.js';
import { SearchStocksReqDto } from './dto/req/search-stocks-req.dto.js';
import { GetNewListingsResDto } from './dto/res/get-new-listings-res.dto.js';
import { GetStocksResDto } from './dto/res/get-stocks-res.dto.js';
import { StocksService } from './stocks.service.js';

@ApiTags('Stocks')
@ApiBadRequestResponse({ description: 'STOCK_INVALID_CURSOR' })
@Controller('stocks')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '상품 목록 (마켓)',
    description:
      '카테고리별로 조회하고 정렬한다. 시세 값은 체결 작업 전까지 현재가=기준가, 나머지 0이며 모든 정렬이 최근 상장순으로 동작한다.',
  })
  @ApiOkResponse({ type: GetStocksResDto })
  getStocks(@Query() query: GetStocksReqDto): Promise<GetStocksResDto> {
    return this.stocksService.getStocks(query);
  }

  @OptionalAuth()
  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '상품 검색',
    description:
      '상품명·카테고리명 부분 일치. 로그인했으면 첫 페이지 조회 시 최근 검색어에 저장한다. 토큰 없이도 호출할 수 있다.',
  })
  @ApiOkResponse({ type: GetStocksResDto })
  searchStocks(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: SearchStocksReqDto,
  ): Promise<GetStocksResDto> {
    return this.stocksService.searchStocks(user?.userId, query);
  }

  @Public()
  @Get('new-listings')
  @ApiOperation({
    summary: '신규 상장 목록',
    description: '최근 상장순. 홈 화면은 size=3으로 호출한다.',
  })
  @ApiOkResponse({ type: GetNewListingsResDto })
  getNewListings(
    @Query() query: GetNewListingsReqDto,
  ): Promise<GetNewListingsResDto> {
    return this.stocksService.getNewListings(query);
  }
}
