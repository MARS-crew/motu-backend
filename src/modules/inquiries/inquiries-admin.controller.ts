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
  description: '활성 관리자 권한 필요. 최초 담당자에 따른 제한은 없다.',
})
@ApiBadRequestResponse({
  description:
    'BAD_REQUEST / INQUIRY_REPLY_EMAIL_REQUIRED / INQUIRY_REPLY_DRAFT_REQUIRED',
})
@ApiConflictResponse({
  description:
    'INQUIRY_ADMIN_INVALID_STATUS / INQUIRY_REPLY_VERSION_CONFLICT / INQUIRY_REPLY_SENDING / INQUIRY_REPLY_REQUEST_CONFLICT / INQUIRY_REPLY_RETRY_CONFIRMATION_REQUIRED',
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
      '상세 조회는 상태를 바꾸지 않는다. 처리 중 문의는 다른 활성 관리자도 버전을 확인해 수정·발송할 수 있다. canEdit는 상태와 발송 진행 여부를 반영한다. 처리 이력은 activityLogPath로 조회한다.',
  })
  @ApiOkResponse({ type: AdminInquiryDetailResDto })
  detail(
    @Param('id', ParseIdPipe) id: number,
    @Query() query: GetAdminInquiryDetailReqDto,
  ) {
    return this.inquiries.detail(id, query);
  }

  @Post(':id/start-processing')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '문의 처리 시작 및 담당자 지정',
    description:
      '접수 → 처리 중. 최초 처리 시작 관리자와 시각을 기록한다. 처리 중 재요청은 다른 관리자도 기존 시작 결과를 반환한다. 담당자 기록은 수정·발송 권한을 독점하지 않는다. 회원 잠금·정지는 변경하지 않는다.',
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
      '[이메일 답변 및 완료] 클릭 시 확인 팝업을 열기 전에 프론트가 내부 호출한다. 별도 저장 버튼은 필요 없다. 상세 replyVersion과 입력 내용을 보내고 성공 응답의 replyDraft·replyVersion으로 팝업을 구성한다. 활성 관리자 모두 처리 중 문의를 저장할 수 있으며 운영 활동 이력은 생성하지 않는다. 발송 중·결과 불명확·완료 반영 대기에서는 수정할 수 없다. 409 시 로컬 입력을 보존하고 최신 내용을 확인한다.',
  })
  @ApiOkResponse({ type: SaveInquiryReplyDraftResDto })
  saveDraft(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SaveInquiryReplyDraftReqDto,
  ) {
    return this.inquiries.saveDraft(id, dto);
  }

  @Post(':id/send-reply')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '문의 이메일 답변 발송 및 완료 처리',
    description:
      'reply-draft 저장 성공 후 확인 팝업의 [발송]에서만 호출한다. 팝업 취소 시 입력을 유지하고 이 API는 호출하지 않는다. expectedDraftVersion은 저장 응답 버전이다. 다른 활성 관리자도 이어서 발송·동일 requestId의 결과 확인·완료 반영을 수행할 수 있다. 최초 발송자의 신원은 발송 시도에 보존한다. 응답 유실은 같은 키·버전으로 재요청한다. 실제 Brevo 접수 때 COMPLETED, 콘솔은 SIMULATED·처리 중 유지. 타임아웃은 자동 재발송하지 않는다.',
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
