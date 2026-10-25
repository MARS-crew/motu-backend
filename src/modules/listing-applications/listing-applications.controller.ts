import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetListingDraftsReqDto } from './dto/req/get-listing-drafts-req.dto.js';
import { SaveListingDraftReqDto } from './dto/req/save-listing-draft-req.dto.js';
import {
  GetListingDraftsResDto,
  ListingDraftResDto,
} from './dto/res/listing-draft-res.dto.js';
import { ListingApplicationsService } from './listing-applications.service.js';

@ApiTags('Listing applications - Drafts')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'BAD_REQUEST / LISTING_INVALID_URL / LISTING_INVALID_ATTACHMENT',
})
@ApiConflictResponse({
  description:
    'LISTING_DRAFT_LIMIT_EXCEEDED / LISTING_URL_IN_PROGRESS / LISTING_APPLICATION_NOT_DRAFT / LISTING_DRAFT_CONFLICT',
})
@ApiGoneResponse({ description: 'LISTING_DRAFT_EXPIRED' })
@ApiNotFoundResponse({
  description: 'LISTING_APPLICATION_NOT_FOUND / FILE_NOT_FOUND',
})
@Controller('listing-applications/drafts')
export class ListingApplicationsController {
  constructor(private readonly applications: ListingApplicationsService) {}

  @Post()
  @ApiOperation({
    summary: '상장 신청 임시저장 생성',
    description:
      '빈 요청도 가능. 계정당 5건, 공식 URL은 전체 계정의 진행 중 신청에서 중복 불가. 최종 제출/접수번호 발급 아님.',
  })
  @ApiCreatedResponse({ type: ListingDraftResDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: SaveListingDraftReqDto) {
    return this.applications.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: '작성 중 목록',
    description:
      '최근 저장순. 진입 화면 limit=2, 전체 보기 limit=5. 만료·삭제·접수 이후 건은 제외.',
  })
  @ApiOkResponse({ type: GetListingDraftsResDto })
  list(@CurrentUser() user: AuthUser, @Query() query: GetListingDraftsReqDto) {
    return this.applications.list(user.userId, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: '이어서 작성할 임시저장 상세 조회' })
  @ApiOkResponse({ type: ListingDraftResDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.applications.get(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: '임시저장 부분 수정',
    description:
      '누락 필드는 유지, null은 초기화. 저장할 때마다 만료 시각이 90일 후로 갱신됨.',
  })
  @ApiOkResponse({ type: ListingDraftResDto })
  save(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: SaveListingDraftReqDto,
  ) {
    return this.applications.save(user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '임시저장 삭제',
    description: '삭제 후 건수 한도와 공식 URL 점유를 해제한다.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIdPipe) id: number) {
    return this.applications.remove(user.userId, id);
  }
}
