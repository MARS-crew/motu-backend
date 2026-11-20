import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetInquiriesReqDto } from './dto/req/get-inquiries-req.dto.js';
import {
  GetInquiriesResDto,
  InquiryResDto,
} from './dto/res/inquiry-res.dto.js';
import { InquiryAuthGuard } from './inquiry-auth.guard.js';
import { InquiriesService } from './inquiries.service.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { InquiryErrors } from './inquiries.errors.js';

@ApiTags('Inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  // 이전 클라이언트에 명시적으로 전환을 안내한다. 비밀번호 확인·토큰 발급·접수는 실행하지 않는다.
  @Public()
  @Post('access-token')
  @ApiExcludeEndpoint()
  accessToken(): never {
    throw new BusinessException(InquiryErrors.LEGACY_SUBMISSION_RETIRED);
  }

  @Public()
  @Post()
  @ApiExcludeEndpoint()
  create(): never {
    throw new BusinessException(InquiryErrors.LEGACY_SUBMISSION_RETIRED);
  }

  @Public()
  @Get()
  @UseGuards(InquiryAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '본인 1:1 문의 내역',
    description:
      '과거 회원 연결 문의의 읽기 전용 조회. 정상 계정의 일반 로그인 토큰 또는 종료 전에 발급되어 아직 유효한 문의 토큰만 사용한다. 신규 문의는 POST /api/account-inquiries로 접수하며 이 목록에는 포함되지 않는다. 최신순·기본 10건.',
  })
  @ApiOkResponse({ type: GetInquiriesResDto })
  list(@CurrentUser() user: AuthUser, @Query() query: GetInquiriesReqDto) {
    return this.inquiries.list(user.userId, query.page, query.size);
  }

  @Public()
  @Get(':inquiryId')
  @UseGuards(InquiryAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '본인 1:1 문의 상세',
    description:
      '타인 문의와 존재하지 않는 문의는 모두 INQUIRY_NOT_FOUND로 반환한다.',
  })
  @ApiOkResponse({ type: InquiryResDto })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('inquiryId', ParseIdPipe) id: number,
  ) {
    return this.inquiries.detail(user.userId, id);
  }
}
