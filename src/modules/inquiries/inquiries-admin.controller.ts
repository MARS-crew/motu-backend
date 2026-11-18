import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { clientInfo } from '../../common/utils/client-info.js';
import { Role } from '../../generated/prisma/client.js';
import {
  GetAdminInquiriesReqDto,
  GetAdminInquiryDetailReqDto,
} from './dto/req/get-admin-inquiries-req.dto.js';
import {
  SaveInquiryReplyDraftReqDto,
  SendInquiryReplyReqDto,
} from './dto/req/reply-inquiry-req.dto.js';
import {
  AdminInquiryDetailResDto,
  GetAdminInquiriesResDto,
  InquiryReplyResultResDto,
  SaveInquiryReplyDraftResDto,
  StartInquiryProcessingResDto,
} from './dto/res/admin-inquiry-res.dto.js';
import { InquiriesAdminService } from './inquiries-admin.service.js';

@ApiTags('Admin - Inquiries')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@ApiNotFoundResponse({ description: 'INQUIRY_ADMIN_NOT_FOUND' })
@ApiForbiddenResponse({
  description: '관리자 권한 필요 / INQUIRY_ADMIN_ASSIGNEE_ONLY',
})
@ApiBadRequestResponse({
  description:
    'BAD_REQUEST / INQUIRY_REPLY_EMAIL_REQUIRED / INQUIRY_REPLY_DRAFT_REQUIRED',
})
@ApiConflictResponse({
  description:
    'INQUIRY_ADMIN_ALREADY_ASSIGNED / INQUIRY_ADMIN_INVALID_STATUS / INQUIRY_REPLY_VERSION_CONFLICT / INQUIRY_REPLY_SENDING / INQUIRY_REPLY_REQUEST_CONFLICT / INQUIRY_REPLY_RETRY_CONFIRMATION_REQUIRED',
})
@Controller('admin/inquiries')
export class InquiriesAdminController {
  constructor(private readonly inquiries: InquiriesAdminService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '계정·인증 문의 목록 검색 및 페이징',
    description:
      '접수번호 부분 검색, 상태·문의 유형 필터, 접수 최신순. 마이페이지 일반 문의와 구분되는 계정·인증 문의 관리다.',
  })
  @ApiOkResponse({ type: GetAdminInquiriesResDto })
  list(@Query() query: GetAdminInquiriesReqDto) {
    return this.inquiries.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '계정·인증 문의 상세와 발송 이력',
    description:
      '상세 조회는 상태를 바꾸지 않는다. 다른 담당자의 문의도 조회할 수 있지만 수정·발송은 담당자만 가능하다. 처리 이력은 activityLogPath로 조회한다.',
  })
  @ApiOkResponse({ type: AdminInquiryDetailResDto })
  detail(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() admin: AuthUser,
    @Query() query: GetAdminInquiryDetailReqDto,
  ) {
    return this.inquiries.detail(id, admin.userId, query);
  }

  @Post(':id/start-processing')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '문의 처리 시작 및 담당자 지정',
    description:
      '접수 → 처리 중. 담당자는 현재 관리자다. 같은 담당자의 재요청은 기존 결과를 반환하고 다른 담당자는 409다. 회원 잠금·정지는 변경하지 않는다.',
  })
  @ApiOkResponse({ type: StartInquiryProcessingResDto })
  start(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.inquiries.start(id, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Patch(':id/reply-draft')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '문의 이메일 답변 초안 저장',
    description:
      '담당자·처리 중 상태만. 상세의 replyVersion을 expectedVersion으로 보낸다. 발송 중·결과 불명확·완료 반영 대기 상태에서는 수정할 수 없다.',
  })
  @ApiOkResponse({ type: SaveInquiryReplyDraftResDto })
  saveDraft(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SaveInquiryReplyDraftReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.inquiries.saveDraft(id, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':id/send-reply')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '문의 이메일 답변 발송 및 완료 처리',
    description:
      '확인 팝업에서 저장 답변 버전을 확인한 후 새 requestId로 발송한다. 응답 유실은 동일 키로 재요청한다. 실제 Brevo 발송 접수 때 APPROVED(처리 완료), 콘솔 모의 발송은 SIMULATED·처리 중 유지. 타임아웃은 자동 재발송하지 않으며 외부 이력 확인 후 명시적 confirmResend·사유·새 키로만 재시도한다.',
  })
  @ApiOkResponse({ type: InquiryReplyResultResDto })
  @ApiServiceUnavailableResponse({
    description:
      'INQUIRY_REPLY_SEND_FAILED / INQUIRY_REPLY_DELIVERY_UNKNOWN. 초안·상태 유지',
  })
  sendReply(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SendInquiryReplyReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.inquiries.sendReply(id, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }
}
