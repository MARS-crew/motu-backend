import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AnomaliesService } from './anomalies.service.js';
import { GetAnomaliesReqDto } from './dto/req/get-anomalies-req.dto.js';
import { ReviewAnomalyReqDto } from './dto/req/review-anomaly-req.dto.js';
import { GetAnomaliesResDto } from './dto/res/get-anomalies-res.dto.js';
import { GetAnomalyResDto } from './dto/res/get-anomaly-res.dto.js';

@ApiTags('Admin - Anomalies')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/anomalies')
export class AnomaliesController {
  constructor(private readonly anomaliesService: AnomaliesService) {}

  @Get()
  @ApiOperation({
    summary: '이상 거래 목록 (ADM-MON-01)',
    description:
      '최신 발생순. summary는 현재 조회 조건의 전체·미처리·유형별 건수다. 기본 기간(최근 24시간)은 프론트가 from으로 보낸다.',
  })
  @ApiOkResponse({ type: GetAnomaliesResDto })
  @ApiBadRequestResponse({ description: 'ANOMALY_INVALID_PERIOD' })
  getAnomalies(
    @Query() query: GetAnomaliesReqDto,
  ): Promise<GetAnomaliesResDto> {
    return this.anomaliesService.getAnomalies(query);
  }

  @Get(':anomalyId')
  @ApiOperation({
    summary: '이상 거래 상세 (ADM-MON-02)',
    description:
      '탐지 정보·근거와 처리 결과. 조회만으로 처리 상태를 바꾸지 않는다.',
  })
  @ApiOkResponse({ type: GetAnomalyResDto })
  @ApiNotFoundResponse({ description: 'ANOMALY_NOT_FOUND' })
  getAnomaly(
    @Param('anomalyId', ParseIdPipe) anomalyId: number,
  ): Promise<GetAnomalyResDto> {
    return this.anomaliesService.getAnomaly(anomalyId);
  }

  @Post(':anomalyId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '조치 내용 확인 (확인중으로 변경)',
    description:
      '상품 거래 중지·회원 정지 화면으로 넘어가기 전에 호출한다. 처리완료는 그 화면에서 anomalyId를 함께 보내 확정할 때 된다.',
  })
  @ApiOkResponse({ type: GetAnomalyResDto })
  @ApiBadRequestResponse({
    description: 'ANOMALY_TARGET_MISMATCH (상품이 없는 이상 거래를 거래 중지)',
  })
  @ApiNotFoundResponse({ description: 'ANOMALY_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ANOMALY_ALREADY_RESOLVED' })
  review(
    @CurrentUser() admin: AuthUser,
    @Param('anomalyId', ParseIdPipe) anomalyId: number,
    @Body() dto: ReviewAnomalyReqDto,
  ): Promise<GetAnomalyResDto> {
    return this.anomaliesService.review(anomalyId, dto.action, admin.userId);
  }

  @Post(':anomalyId/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '이상 없음 처리',
    description:
      '확인 모달에서 확정하면 처리완료로 바꾸고 관리자 활동 이력(ANOMALY_ACTION)에 사유를 남긴다.',
  })
  @ApiOkResponse({ type: GetAnomalyResDto })
  @ApiNotFoundResponse({ description: 'ANOMALY_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ANOMALY_ALREADY_RESOLVED' })
  dismiss(
    @CurrentUser() admin: AuthUser,
    @Param('anomalyId', ParseIdPipe) anomalyId: number,
    @Body() dto: AdminReasonReqDto,
    @Req() request: Request,
  ): Promise<GetAnomalyResDto> {
    return this.anomaliesService.dismiss(anomalyId, dto.reason, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }
}
