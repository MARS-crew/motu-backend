import {
  Body,
  Controller,
  Delete,
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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { CreateAdminNoticeReqDto } from './dto/req/create-admin-notice-req.dto.js';
import { GetAdminNoticesReqDto } from './dto/req/get-admin-notices-req.dto.js';
import { UpdateAdminNoticeReqDto } from './dto/req/update-admin-notice-req.dto.js';
import {
  AdminNoticeResDto,
  GetAdminNoticesResDto,
} from './dto/res/admin-notice-res.dto.js';
import { NoticesAdminService } from './notices-admin.service.js';

@ApiTags('Admin - Notices')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/notices')
export class NoticesAdminController {
  constructor(private readonly notices: NoticesAdminService) {}

  @Get()
  @ApiOperation({ summary: '관리자 공지사항 목록' })
  @ApiOkResponse({ type: GetAdminNoticesResDto })
  list(@Query() query: GetAdminNoticesReqDto) {
    return this.notices.list(query);
  }

  @Get(':noticeId')
  @ApiOperation({ summary: '관리자 공지사항 상세' })
  @ApiOkResponse({ type: AdminNoticeResDto })
  @ApiNotFoundResponse({ description: 'NOTICE_ADMIN_NOT_FOUND' })
  detail(@Param('noticeId', ParseIdPipe) id: number) {
    return this.notices.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '공지사항 등록' })
  @ApiCreatedResponse({ type: AdminNoticeResDto })
  @ApiConflictResponse({ description: 'NOTICE_PIN_LIMIT_EXCEEDED' })
  create(
    @Body() dto: CreateAdminNoticeReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.notices.create(dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Patch(':noticeId')
  @ApiOperation({ summary: '공지사항 수정' })
  @ApiOkResponse({ type: AdminNoticeResDto })
  @ApiNotFoundResponse({ description: 'NOTICE_ADMIN_NOT_FOUND' })
  @ApiConflictResponse({ description: 'NOTICE_PIN_LIMIT_EXCEEDED' })
  update(
    @Param('noticeId', ParseIdPipe) id: number,
    @Body() dto: UpdateAdminNoticeReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.notices.update(id, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Delete(':noticeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '공지사항 삭제' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'NOTICE_ADMIN_NOT_FOUND' })
  async remove(
    @Param('noticeId', ParseIdPipe) id: number,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.notices.remove(id, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }
}
