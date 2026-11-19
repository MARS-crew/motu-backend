import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
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
import {
  ApproveListingReqDto,
  ExtendListingRevisionDeadlineReqDto,
  RequestListingRevisionReqDto,
} from './dto/req/review-listing-req.dto.js';
import { ListingReviewResultResDto } from './dto/res/listing-review-res.dto.js';
import { ListingReviewService } from './listing-review.service.js';

@ApiTags('Admin - Listing Applications')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@ApiOkResponse({ type: ListingReviewResultResDto })
@ApiConflictResponse({
  description:
    'LISTING_REVIEW_INVALID_STATE / LISTING_REVIEW_ISSUER_ACCOUNT_REQUIRED',
})
@ApiBadRequestResponse({
  description:
    'LISTING_REVIEW_INVALID_APPROVAL / LISTING_REVIEW_INVALID_DEADLINE / LISTING_REVIEW_INCOMPLETE_APPLICATION',
})
@ApiNotFoundResponse({ description: 'LISTING_APPLICATION_NOT_FOUND' })
@Controller('admin/listing-applications')
export class ListingReviewController {
  constructor(private readonly reviews: ListingReviewService) {}

  @Post(':id/start-review')
  @HttpCode(200)
  @ApiOperation({
    summary: '상장 신청 검토 시작',
    description:
      '접수 → 검토 중. 프론트는 접수 상태에서 [심사 결과 처리] 클릭 시 이 API 성공 후 처리 화면으로 이동한다. 상세 조회는 상태를 변경하지 않는다. 이미 검토 중이면 다시 호출하지 않는다. 경합으로 409이면 최신 상태를 다시 조회한다.',
  })
  start(
    @Param('id', ParseIdPipe) id: number,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.reviews.start(id, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':id/revision-requests')
  @HttpCode(200)
  @ApiOperation({
    summary: '보완 요청 생성·기한 지정',
    description:
      '검토 중 → 보완 요청. 요청 항목·내용·미래 기한 필수. 기존 사용자 재제출 API로 검토 중으로 복귀한다.',
  })
  requestRevision(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: RequestListingRevisionReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.reviews.requestRevision(id, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':id/revision-requests/:revisionId/extend-deadline')
  @HttpCode(200)
  @ApiOperation({
    summary: '미재제출 보완 기한 연장',
    description:
      '보완 요청 상태만 허용. 상세 화면의 [보완 기한 연장]에서 새 기한과 사유를 입력해 호출한다. 경과한 기한도 미래로 연장할 수 있다. 기존 기한보다 늦어야 하며 연장 사유 필수.',
  })
  extend(
    @Param('id', ParseIdPipe) id: number,
    @Param('revisionId', ParseIdPipe) revisionId: number,
    @Body() dto: ExtendListingRevisionDeadlineReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.reviews.extendDeadline(id, revisionId, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: '상장 신청 반려',
    description:
      '검토 중 → 반려. 처리 사유 필수. 이전 신청서·신청번호·이력을 보존한다.',
  })
  reject(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: AdminReasonReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.reviews.reject(id, dto.reason, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: '상장 승인 및 거래 대기 상품 생성',
    description:
      '검토 중 → 승인. 최종 상장가·발행량·상장일·미래 거래 시작일시·사유 필수. 가격 변경 시 조정 사유 필수. 상품과 활동 이력을 함께 저장하고 5초 주기로 거래 시작 시각을 확인한다.',
  })
  approve(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: ApproveListingReqDto,
    @CurrentUser() admin: AuthUser,
    @Req() request: Request,
  ) {
    return this.reviews.approve(id, dto, {
      adminId: admin.userId,
      client: clientInfo(request),
    });
  }
}
