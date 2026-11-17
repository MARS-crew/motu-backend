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
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { clientInfo } from '../../common/utils/client-info.js';
import { Role } from '../../generated/prisma/client.js';
import { AdminReasonReqDto } from './dto/req/admin-reason-req.dto.js';
import { ChangeUserStatusReqDto } from './dto/req/change-user-status-req.dto.js';
import { GetAdminUsersReqDto } from './dto/req/get-admin-users-req.dto.js';
import { ChangeUserStatusResDto } from './dto/res/change-user-status-res.dto.js';
import { GetAdminUserResDto } from './dto/res/get-admin-user-res.dto.js';
import { GetAdminUsersResDto } from './dto/res/get-admin-users-res.dto.js';
import { UsersAdminService } from './users-admin.service.js';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersAdminService: UsersAdminService) {}

  @Get()
  @ApiOperation({
    summary: '회원 목록',
    description:
      '아이디·닉네임 부분 일치, 회원 상태 필터. 일반 회원만 나온다. 가입일 최신순, 기본 10건.',
  })
  @ApiOkResponse({ type: GetAdminUsersResDto })
  getUsers(@Query() query: GetAdminUsersReqDto): Promise<GetAdminUsersResDto> {
    return this.usersAdminService.getUsers(query);
  }

  @Get(':userId')
  @ApiOperation({
    summary: '회원 상세',
    description:
      '기본 정보, 인증·계정, 자산·활동. 최근 처리 이력은 GET /api/admin/activity-logs?targetType=USER&targetId={userId}&size=1',
  })
  @ApiOkResponse({ type: GetAdminUserResDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  getUser(
    @Param('userId', ParseIdPipe) userId: number,
  ): Promise<GetAdminUserResDto> {
    return this.usersAdminService.getUser(userId);
  }

  @Patch(':userId/status')
  @ApiOperation({
    summary: '회원 상태 변경',
    description:
      '정상·잠금·정지 중 하나로 바꾼다. 잠금·정지로 바꾸면 로그인 세션을 모두 만료한다. 사유는 관리자 활동 이력(USER_STATUS_CHANGE)에 남는다.',
  })
  @ApiOkResponse({ type: ChangeUserStatusResDto })
  @ApiBadRequestResponse({ description: 'USER_STATUS_UNCHANGED' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'USER_STATUS_CONFLICT' })
  changeStatus(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIdPipe) userId: number,
    @Body() dto: ChangeUserStatusReqDto,
    @Req() request: Request,
  ): Promise<ChangeUserStatusResDto> {
    return this.usersAdminService.changeStatus(userId, dto.status, {
      adminId: admin.userId,
      reason: dto.reason,
      client: clientInfo(request),
    });
  }

  @Post(':userId/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '계정 잠금 해제',
    description:
      '잠금 계정을 정상으로 바꾸고 로그인 실패 횟수를 0으로 초기화한다. 사유는 관리자 활동 이력(USER_UNLOCK)에 남는다.',
  })
  @ApiOkResponse({ type: ChangeUserStatusResDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'USER_NOT_LOCKED / USER_STATUS_CONFLICT',
  })
  unlock(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIdPipe) userId: number,
    @Body() dto: AdminReasonReqDto,
    @Req() request: Request,
  ): Promise<ChangeUserStatusResDto> {
    return this.usersAdminService.unlock(userId, {
      adminId: admin.userId,
      reason: dto.reason,
      client: clientInfo(request),
    });
  }
}
