import { Body, Controller, Get, Patch, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { clientInfo } from '../../common/utils/client-info.js';
import { Role } from '../../generated/prisma/client.js';
import { GetInitialGrantHistoryReqDto } from './dto/req/get-initial-grant-history-req.dto.js';
import { UpdateInitialGrantReqDto } from './dto/req/update-initial-grant-req.dto.js';
import { GetInitialGrantHistoryResDto } from './dto/res/get-initial-grant-history-res.dto.js';
import { InitialGrantResDto } from './dto/res/initial-grant-res.dto.js';
import { PointSettingsService } from './point-settings.service.js';

@ApiTags('Admin - Point Settings')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@ApiUnauthorizedResponse({ description: '로그인 필요' })
@ApiForbiddenResponse({ description: '활성 관리자만 사용 가능' })
@Controller('admin/point-settings/initial-grant')
export class PointSettingsController {
  constructor(private readonly settings: PointSettingsService) {}

  @Get()
  @ApiOperation({ summary: '신규 가입 초기 지급액 조회' })
  @ApiOkResponse({ type: InitialGrantResDto })
  get(): Promise<InitialGrantResDto> {
    return this.settings.getInitialGrant();
  }

  @Patch()
  @ApiOperation({
    summary: '신규 가입 초기 지급액 변경',
    description:
      'amount·expectedVersion·reason을 전달한다. 이후 신규 가입자에게만 적용하며 기존 회원·리셋·추가 지급은 유지한다. 같은 버전의 같은 금액은 변경 없이 반환한다.',
  })
  @ApiOkResponse({ type: InitialGrantResDto })
  @ApiBadRequestResponse({
    description: 'BAD_REQUEST: 금액·버전·사유 검증 실패',
  })
  @ApiConflictResponse({
    description:
      'POINT_SETTINGS_CONCURRENT_UPDATE: 최신 버전으로 다시 조회 필요',
  })
  update(
    @Body() dto: UpdateInitialGrantReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ): Promise<InitialGrantResDto> {
    return this.settings.updateInitialGrant(dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Get('history')
  @ApiOperation({ summary: '초기 지급액 변경 이력 (최신순)' })
  @ApiOkResponse({ type: GetInitialGrantHistoryResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST: 페이지 검증 실패' })
  history(
    @Query() query: GetInitialGrantHistoryReqDto,
  ): Promise<GetInitialGrantHistoryResDto> {
    return this.settings.getHistory(query);
  }
}
