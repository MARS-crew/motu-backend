import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { Role } from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from './admin-activity-logs.service.js';
import { GetAdminActivityLogsReqDto } from './dto/req/get-admin-activity-logs-req.dto.js';
import { GetAdminActivityLogResDto } from './dto/res/get-admin-activity-log-res.dto.js';
import { GetAdminActivityLogsResDto } from './dto/res/get-admin-activity-logs-res.dto.js';

@ApiTags('Admin - Activity Logs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/activity-logs')
export class AdminActivityLogsController {
  constructor(
    private readonly adminActivityLogsService: AdminActivityLogsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '관리자 활동 이력 목록',
    description:
      '관리자 활동 이력 화면, 상품 상세의 변경 이력 탭(targetType=STOCK&targetId), 대시보드 최근 운영 이력(from=7일 전, size=4)에서 쓴다. 최신순.',
  })
  @ApiOkResponse({ type: GetAdminActivityLogsResDto })
  @ApiBadRequestResponse({
    description:
      'ADMIN_ACTIVITY_LOG_ACTION_TARGET_MISMATCH / ADMIN_ACTIVITY_LOG_TARGET_TYPE_REQUIRED / ADMIN_ACTIVITY_LOG_INVALID_PERIOD',
  })
  getLogs(
    @Query() query: GetAdminActivityLogsReqDto,
  ): Promise<GetAdminActivityLogsResDto> {
    return this.adminActivityLogsService.getLogs(query);
  }

  @Get(':activityLogId')
  @ApiOperation({
    summary: '관리자 활동 이력 상세',
    description: '변경 전·후 값, 처리 사유, 접속 IP(가림)를 포함한다.',
  })
  @ApiOkResponse({ type: GetAdminActivityLogResDto })
  @ApiNotFoundResponse({ description: 'ADMIN_ACTIVITY_LOG_NOT_FOUND' })
  getLog(
    @Param('activityLogId', ParseIdPipe) activityLogId: number,
  ): Promise<GetAdminActivityLogResDto> {
    return this.adminActivityLogsService.getLog(activityLogId);
  }
}
