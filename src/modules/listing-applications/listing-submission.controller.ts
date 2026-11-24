import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { SubmitListingReqDto } from './dto/req/submit-listing-req.dto.js';
import { ListingSubmissionResDto } from './dto/res/listing-submission-res.dto.js';
import { ListingSubmissionService } from './listing-submission.service.js';

@ApiTags('Listing applications - Submission')
@ApiBearerAuth()
@Controller('listing-applications')
export class ListingSubmissionController {
  constructor(private readonly submissions: ListingSubmissionService) {}

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: '상장 신청 최초 최종 제출',
    description:
      '저장된 네 단계 입력과 첨부를 검증하고 2차 보안의 최근 10분 인증을 확인한다. 본인의 EVIDENCE 묶음에 저장 완료된 파일·링크 합산 1~10개와 설명 10~500자가 필요하며, 초안의 자료 설명도 필수다. 본인의 유효한 DRAFT만 접수하며 신청번호·최초 접수일·첨부 동결·SUBMITTED 전환은 한 트랜잭션이다. 이미 접수된 동일 신청서의 재요청은 번호·최초 접수일을 유지하고 현재 상태를 반환한다. 미설정은 번호 등록, TWO_FACTOR_REQUIRED(action=LISTING_SUBMIT)는 공통 재인증 후 같은 요청을 재시도한다. 인증번호는 이 API에 보내지 않는다. 보완 재제출은 기존 resubmit API를 사용한다.',
  })
  @ApiOkResponse({ type: ListingSubmissionResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / LISTING_SUBMISSION_VALIDATION_FAILED(details.fields)',
  })
  @ApiConflictResponse({
    description:
      'TWO_FACTOR_NOT_ENABLED / LISTING_SUBMISSION_CONFLICT / LISTING_SUBMISSION_INVALID_STATUS / LISTING_SUBMISSION_NUMBER_LIMIT',
  })
  @ApiForbiddenResponse({
    description:
      'TWO_FACTOR_REQUIRED / AUTH_ACCOUNT_LOCKED / AUTH_ACCOUNT_BLOCKED',
  })
  @ApiGoneResponse({ description: 'LISTING_DRAFT_EXPIRED' })
  @ApiNotFoundResponse({ description: 'LISTING_APPLICATION_NOT_FOUND' })
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SubmitListingReqDto,
  ) {
    return this.submissions.submit(user.userId, id, dto);
  }
}
