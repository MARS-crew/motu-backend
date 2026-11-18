import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { AdminReasonReqDto } from '../../common/dto/admin-reason-req.dto.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { clientInfo } from '../../common/utils/client-info.js';
import { Role } from '../../generated/prisma/client.js';
import { CloseStockReqDto } from './dto/req/close-stock-req.dto.js';
import { GetAdminStocksReqDto } from './dto/req/get-admin-stocks-req.dto.js';
import { PauseStockReqDto } from './dto/req/pause-stock-req.dto.js';
import { UpdateAdminStockReqDto } from './dto/req/update-admin-stock-req.dto.js';
import { ChangeTradeStatusResDto } from './dto/res/change-trade-status-res.dto.js';
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

  @Patch(':stockId')
  @ApiOperation({
    summary: '상장 상품 정보 수정',
    description:
      '상품명·카테고리·노출 상태(필수), 한 줄 소개·상품 소개·공식 URL·MAU·거래액·지표 기준일(선택, null이면 지움), 수정 사유(필수). 바뀐 항목만 관리자 활동 이력(STOCK_UPDATE)에 남는다. 거래 상태는 바꾸지 않는다.',
  })
  @ApiOkResponse({ type: GetAdminStockResDto })
  @ApiBadRequestResponse({
    description:
      'STOCK_NOT_CHANGED / STOCK_METRICS_DATE_REQUIRED / STOCK_SECTOR_NOT_FOUND',
  })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  updateStock(
    @CurrentUser() admin: AuthUser,
    @Param('stockId', ParseIdPipe) stockId: number,
    @Body() dto: UpdateAdminStockReqDto,
    @Req() request: Request,
  ): Promise<GetAdminStockResDto> {
    return this.stocksAdminService.updateStock(stockId, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':stockId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '거래 중지',
    description:
      '거래 가능 상품만. 미체결 주문을 모두 취소하고 예약 포인트·수량을 해제한 뒤 신규 주문·체결을 막는다. 안내문은 사용자 상품 상세에 표시된다.',
  })
  @ApiOkResponse({ type: ChangeTradeStatusResDto })
  @ApiConflictResponse({ description: 'STOCK_INVALID_TRADE_STATUS' })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  pauseStock(
    @CurrentUser() admin: AuthUser,
    @Param('stockId', ParseIdPipe) stockId: number,
    @Body() dto: PauseStockReqDto,
    @Req() request: Request,
  ): Promise<ChangeTradeStatusResDto> {
    return this.stocksAdminService.pauseStock(stockId, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':stockId/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '거래 재개',
    description:
      '거래 중지 상품만. 재개 시점부터 주문을 다시 받는다. 안내문은 지운다.',
  })
  @ApiOkResponse({ type: ChangeTradeStatusResDto })
  @ApiConflictResponse({ description: 'STOCK_INVALID_TRADE_STATUS' })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  resumeStock(
    @CurrentUser() admin: AuthUser,
    @Param('stockId', ParseIdPipe) stockId: number,
    @Body() dto: AdminReasonReqDto,
    @Req() request: Request,
  ): Promise<ChangeTradeStatusResDto> {
    return this.stocksAdminService.resumeStock(stockId, dto.reason, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':stockId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '상품 종료',
    description:
      '거래 대기·가능·중지 상품. 미체결 주문을 취소하고 예약을 해제한 뒤 거래를 종료한다. 보유 수량은 그대로 남고 되돌릴 수 없다. 안내문은 사용자 상품 상세의 거래 종료 안내에 표시된다.',
  })
  @ApiOkResponse({ type: ChangeTradeStatusResDto })
  @ApiConflictResponse({ description: 'STOCK_INVALID_TRADE_STATUS' })
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  closeStock(
    @CurrentUser() admin: AuthUser,
    @Param('stockId', ParseIdPipe) stockId: number,
    @Body() dto: CloseStockReqDto,
    @Req() request: Request,
  ): Promise<ChangeTradeStatusResDto> {
    return this.stocksAdminService.closeStock(stockId, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }
}
