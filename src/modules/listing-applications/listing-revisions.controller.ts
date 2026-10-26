import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetListingRevisionsReqDto } from './dto/req/get-listing-revisions-req.dto.js';
import { ResubmitListingRevisionReqDto } from './dto/req/resubmit-listing-revision-req.dto.js';
import {
  GetListingRevisionsResDto,
  ListingRevisionResultResDto,
} from './dto/res/listing-revision-res.dto.js';
import { ListingRevisionsService } from './listing-revisions.service.js';

@ApiTags('Listing applications - Revisions')
@ApiBearerAuth()
@ApiNotFoundResponse({
  description: 'LISTING_REVISION_NOT_FOUND (타인·삭제 포함)',
})
@Controller('listing-applications/:applicationId/revision-requests')
export class ListingRevisionsController {
  constructor(private readonly revisions: ListingRevisionsService) {}

  @Get()
  @ApiOperation({ summary: '본인 신청서 보완 요청·재제출 이력 조회' })
  @ApiOkResponse({ type: GetListingRevisionsResDto })
  list(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseIdPipe) id: number,
    @Query() query: GetListingRevisionsReqDto,
  ) {
    return this.revisions.list(id, query.page, query.size, user.userId);
  }

  @Post(':revisionId/resubmit')
  @HttpCode(200)
  @ApiOperation({
    summary: '증빙자료 재제출',
    description:
      '저장 완료된 증빙 묶음을 제출한다. 기존 신청번호를 유지하고 검토 중으로 전환한다. 동일 요청의 재전송은 기존 결과를 반환한다.',
  })
  @ApiOkResponse({ type: ListingRevisionResultResDto })
  resubmit(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', ParseIdPipe) id: number,
    @Param('revisionId', ParseIdPipe) revisionId: number,
    @Body() dto: ResubmitListingRevisionReqDto,
  ) {
    return this.revisions.resubmit(
      user.userId,
      id,
      revisionId,
      dto.evidenceCollectionId,
    );
  }
}
