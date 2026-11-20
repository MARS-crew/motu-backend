import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { clientInfo } from '../../common/utils/client-info.js';
import { Role } from '../../generated/prisma/client.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AllowPasswordChangeRequired } from './allow-password-change-required.decorator.js';
import { ChangeAdminPasswordReqDto } from './dto/req/change-admin-password-req.dto.js';
import { ChangeAdminStatusReqDto } from './dto/req/change-admin-status-req.dto.js';
import { CreateAdminAccountReqDto } from './dto/req/create-admin-account-req.dto.js';
import { ChangeAdminStatusResDto } from './dto/res/change-admin-status-res.dto.js';
import { CreateAdminAccountResDto } from './dto/res/create-admin-account-res.dto.js';

@ApiTags('Admin - Admin Accounts')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/admin-accounts')
export class AdminAccountsController {
  constructor(private readonly adminAccountsService: AdminAccountsService) {}

  @Post()
  @ApiOperation({
    summary: '관리자 계정 생성',
    description:
      '임시 비밀번호를 만들어 등록 이메일로 보낸다. 메일을 보내지 못하면 계정도 만들지 않는다. 만든 계정은 비밀번호를 바꾸기 전까지 비밀번호 변경 외 관리자 API에서 403 ADMIN_PASSWORD_CHANGE_REQUIRED를 받는다. 관리자 활동 이력(ADMIN_CREATE)에 남는다.',
  })
  @ApiCreatedResponse({ type: CreateAdminAccountResDto })
  @ApiConflictResponse({
    description: 'LOGIN_ID_DUPLICATED / EMAIL_DUPLICATED / USER_DUPLICATED',
  })
  @ApiServiceUnavailableResponse({ description: 'MAIL_SEND_FAILED' })
  create(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateAdminAccountReqDto,
    @Req() request: Request,
  ): Promise<CreateAdminAccountResDto> {
    return this.adminAccountsService.create(dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Patch('me/password')
  @AllowPasswordChangeRequired()
  @ApiOperation({
    summary: '관리자 비밀번호 변경',
    description:
      '로그인한 관리자 본인의 비밀번호를 바꾼다. 임시 비밀번호 상태에서도 호출할 수 있고, 성공하면 임시 비밀번호 상태가 풀린다.',
  })
  @ApiOkResponse({ description: 'data: null' })
  @ApiBadRequestResponse({
    description: 'ADMIN_INVALID_CURRENT_PASSWORD / ADMIN_SAME_PASSWORD',
  })
  async changePassword(
    @CurrentUser() admin: AuthUser,
    @Body() dto: ChangeAdminPasswordReqDto,
  ): Promise<null> {
    await this.adminAccountsService.changePassword(
      admin.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return null;
  }

  @Patch(':userId/status')
  @ApiOperation({
    summary: '관리자 계정 상태 변경',
    description:
      '정상·정지 중 하나로 바꾼다. 사유는 필수이고 관리자 활동 이력(ADMIN_STATUS_CHANGE)에 남는다. 정지하면 로그인 세션을 모두 만료하고, 정지 계정은 로그인할 수 없다. 본인 정지(ADM-ACC-02-E01)와 정상 관리자가 0명이 되는 정지(ADM-ACC-02-E02)는 막고, 둘 다 해당하면 본인 정지 오류가 먼저다.',
  })
  @ApiOkResponse({ type: ChangeAdminStatusResDto })
  @ApiBadRequestResponse({ description: 'ADMIN_ACCOUNT_STATUS_UNCHANGED' })
  @ApiNotFoundResponse({ description: 'ADMIN_ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'ADMIN_ACCOUNT_SELF_BLOCK / ADMIN_ACCOUNT_LAST_ACTIVE',
  })
  @ApiForbiddenResponse({ description: 'ADMIN_PASSWORD_CHANGE_REQUIRED' })
  changeStatus(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIdPipe) userId: number,
    @Body() dto: ChangeAdminStatusReqDto,
    @Req() request: Request,
  ): Promise<ChangeAdminStatusResDto> {
    return this.adminAccountsService.changeStatus(
      userId,
      dto.status,
      dto.reason,
      { adminId: admin.userId, client: clientInfo(request) },
    );
  }
}
