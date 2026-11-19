import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { DashboardService } from './dashboard.service.js';
import { GetTradeTrendReqDto } from './dto/req/get-trade-trend-req.dto.js';
import { GetDashboardKpisResDto } from './dto/res/get-dashboard-kpis-res.dto.js';
import { GetTradeTrendResDto } from './dto/res/get-trade-trend-res.dto.js';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @ApiOperation({
    summary: '운영 대시보드 지표 카드',
    description:
      '전체 회원·상장 상품·처리 대기·이상 거래 카드. 화면 진입·새로고침 시 호출한다. 전일 대비는 한국 시간 어제 마감 값과 비교한다.',
  })
  @ApiOkResponse({ type: GetDashboardKpisResDto })
  getKpis(): Promise<GetDashboardKpisResDto> {
    return this.dashboardService.getKpis();
  }

  @Get('trade-trend')
  @ApiOperation({
    summary: '거래량·거래대금 추이',
    description:
      '전체 상품의 구간별 거래량·거래대금과 선택 구간 합계. 거래량/거래대금 전환은 같은 응답의 값을 쓴다.',
  })
  @ApiOkResponse({ type: GetTradeTrendResDto })
  @ApiBadRequestResponse({ description: 'DASHBOARD_INVALID_PERIOD' })
  getTradeTrend(
    @Query() query: GetTradeTrendReqDto,
  ): Promise<GetTradeTrendResDto> {
    return this.dashboardService.getTradeTrend(query);
  }
}
