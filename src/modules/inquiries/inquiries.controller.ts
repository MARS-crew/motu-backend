import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { LoginReqDto } from '../auth/dto/req/login-req.dto.js';
import { CreateInquiryReqDto } from './dto/req/create-inquiry-req.dto.js';
import { GetInquiriesReqDto } from './dto/req/get-inquiries-req.dto.js';
import {
  GetInquiriesResDto,
  InquiryAccessTokenResDto,
  InquiryResDto,
} from './dto/res/inquiry-res.dto.js';
import { InquiryAuthGuard } from './inquiry-auth.guard.js';
import { InquirySessionRateLimitGuard } from './inquiry-session-rate-limit.guard.js';
import { InquiriesService } from './inquiries.service.js';

@ApiTags('Inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Public()
  @Post('access-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InquirySessionRateLimitGuard)
  @ApiOperation({
    summary: '잠금·정지 계정 문의 본인 확인',
    description:
      '아이디·비밀번호로 15분 문의 전용 토큰 발급. 일반 로그인·계정 해제를 수행하지 않는다. 계정당 1분 10회 제한.',
  })
  @ApiBody({
    type: LoginReqDto,
    examples: {
      locked: {
        summary: '잠금 계정 (로컬 테스트용)',
        value: { loginId: 'motulocked', password: 'motuuser1!' },
      },
    },
  })
  @ApiOkResponse({ type: InquiryAccessTokenResDto })
  accessToken(@Body() dto: LoginReqDto) {
    return this.inquiries.createAccessToken(dto);
  }

  @Public()
  @Post()
  @UseGuards(InquiryAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '잠금·정지 계정 1:1 문의 접수',
    description:
      '문의 전용 토큰 필요. 문의번호 발급 및 SUBMITTED 저장. 제목 1~100자, 본문 1~5000자. 문의유형·작성자는 서버가 결정한다.',
  })
  @ApiCreatedResponse({ type: InquiryResDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInquiryReqDto) {
    return this.inquiries.create(user.userId, dto);
  }

  @Public()
  @Get()
  @UseGuards(InquiryAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '본인 1:1 문의 내역',
    description:
      '문의 전용 토큰 사용. 계정 해제 후에는 일반 로그인 토큰도 사용 가능. 최신순·기본 10건이며 타인 문의는 포함하지 않는다.',
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
