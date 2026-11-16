import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { Role } from '../../generated/prisma/client.js';
import { GetAdminStocksReqDto } from './dto/req/get-admin-stocks-req.dto.js';
import { GetAdminStockResDto } from './dto/res/get-admin-stock-res.dto.js';
import { GetAdminStocksResDto } from './dto/res/get-admin-stocks-res.dto.js';
import { StocksAdminService } from './stocks-admin.service.js';

@ApiTags('Admin - Stocks')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/stocks')
export class StocksAdminController {
  constructor(private readonly stocksAdminService: StocksAdminService) {}

  @Get()
  @ApiOperation({
    summary: '상장 상품 목록',
    description:
      '상품명·상품 코드·상품 ID 검색, 상품 상태·카테고리·노출 상태 필터. 비공개 상품도 나온다. 최근 등록순.',
  })
  @ApiOkResponse({ type: GetAdminStocksResDto })
  getStocks(
    @Query() query: GetAdminStocksReqDto,
  ): Promise<GetAdminStocksResDto> {
    return this.stocksAdminService.getStocks(query);
  }

  @Get(':stockId')
  @ApiOperation({
    summary: '상장 상품 상세',
    description:
      '기본 정보, 거래 정보(현재가·총 발행량·거래 시작일시·미체결 주문 건수), 서비스 지표. 변경 이력 탭은 GET /api/admin/activity-logs?targetType=STOCK&targetId={stockId}',
  })
  @ApiOkResponse({ type: GetAdminStockResDto })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  getStock(
    @Param('stockId', ParseIdPipe) stockId: number,
  ): Promise<GetAdminStockResDto> {
    return this.stocksAdminService.getStock(stockId);
  }
}
