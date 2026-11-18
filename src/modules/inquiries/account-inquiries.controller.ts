import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { CreateAccountInquiryReqDto } from './dto/req/create-account-inquiry-req.dto.js';
import { AccountInquiryResDto } from './dto/res/account-inquiry-res.dto.js';
import { AccountInquiriesService } from './account-inquiries.service.js';
import { AccountInquiryRateLimitGuard } from './account-inquiry-rate-limit.guard.js';

@ApiTags('Inquiries')
@Controller('account-inquiries')
export class AccountInquiriesController {
  constructor(private readonly inquiries: AccountInquiriesService) {}

  @Public()
  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(AccountInquiryRateLimitGuard)
  @ApiOperation({
    summary: '비로그인 계정·인증 문의 접수',
    description:
      'USR-AUTH-10. 인증 토큰 없이 문의 유형·회신 이메일·내용만 입력한다. 회원 존재 여부와 무관하게 접수하고 이메일로 계정을 연결하지 않는다. 접수번호·접수 시각을 반환하며 ADM-INQ-01 관리자가 입력 이메일로 답변한다. 비밀번호·인증번호·휴대폰 전체 번호는 입력하지 않는다. 회신 이메일별 1시간 3건, 접속 IP별 1분 60회 제한. 접수 시 이메일은 발송하지 않는다.',
  })
  @ApiCreatedResponse({ type: AccountInquiryResDto })
  @ApiTooManyRequestsResponse({
    description: 'INQUIRY_SUBMISSION_RATE_LIMITED',
  })
  create(@Body() dto: CreateAccountInquiryReqDto) {
    return this.inquiries.create(dto);
  }
}
