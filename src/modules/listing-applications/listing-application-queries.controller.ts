import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import {
  ListingApplicationResDto,
  ListingApplicationStatusResDto,
} from './dto/res/listing-application-res.dto.js';

@ApiTags('Listing applications - Queries')
@ApiBearerAuth()
@ApiNotFoundResponse({
  description: 'LISTING_APPLICATION_NOT_FOUND (타인·삭제 포함)',
})
@ApiBadRequestResponse({ description: 'BAD_REQUEST' })
@Controller('listing-applications')
export class ListingApplicationQueriesController {
  constructor(private readonly applications: ListingApplicationsService) {}

  @Get(':id/status')
  @ApiOperation({
    summary: '본인 상장 신청 현재 상태 조회',
    description:
      '만료 상태도 조회 가능. 상태를 변경하거나 신청번호를 발급하지 않는다.',
  })
  @ApiOkResponse({ type: ListingApplicationStatusResDto })
  status(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.applications.getApplicationStatus(user.userId, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: '본인 상장 신청 상세 조회',
    description:
      '작성 중 및 접수 이후 저장된 내용을 조회한다. 첨부는 저장 완료 자료만 제공한다.',
  })
  @ApiOkResponse({ type: ListingApplicationResDto })
  @ApiGoneResponse({ description: 'LISTING_DRAFT_EXPIRED' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.applications.getApplication(user.userId, id);
  }
}
