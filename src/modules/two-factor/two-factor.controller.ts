import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ConfirmPhoneVerificationReqDto } from './dto/req/confirm-phone-verification-req.dto.js';
import { ConfirmTwoFactorVerificationReqDto } from './dto/req/confirm-two-factor-verification-req.dto.js';
import { SendPhoneVerificationReqDto } from './dto/req/send-phone-verification-req.dto.js';
import { ConfirmTwoFactorVerificationResDto } from './dto/res/confirm-two-factor-verification-res.dto.js';
import { GetTwoFactorResDto } from './dto/res/get-two-factor-res.dto.js';
import { SendTwoFactorVerificationResDto } from './dto/res/send-two-factor-verification-res.dto.js';
import { ClientInfo, TwoFactorService } from './two-factor.service.js';

@ApiTags('Two Factor')
@ApiBearerAuth()
@Controller('two-factor')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Get()
  @ApiOperation({
    summary: '2차 보안 상태 조회',
    description:
      '마이페이지 계정·보안 화면. 설정 상태, 등록 휴대폰(가림), 설정일시, 최근 인증일시.',
  })
  @ApiOkResponse({ type: GetTwoFactorResDto })
  getStatus(@CurrentUser() user: AuthUser): Promise<GetTwoFactorResDto> {
    return this.twoFactorService.getStatus(user.userId);
  }

  @Post('phone-verifications')
  @ApiOperation({
    summary: '2차 보안 휴대폰 인증번호 발송',
    description:
      '2차 보안 설정 또는 등록 휴대폰 변경. 이미 설정한 계정은 기존 번호로 재인증(10분)을 먼저 마쳐야 하며, 아니면 403 TWO_FACTOR_REQUIRED(action=PHONE_CHANGE). 재발송은 30초 후 가능하다.',
  })
  @ApiCreatedResponse({ type: SendTwoFactorVerificationResDto })
  sendPhoneVerification(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendPhoneVerificationReqDto,
  ): Promise<SendTwoFactorVerificationResDto> {
    return this.twoFactorService.sendPhoneVerification(
      user.userId,
      dto.phoneNumber,
    );
  }

  @Post('phone-verifications/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '2차 보안 설정 (휴대폰 인증 확인)',
    description:
      '인증번호가 맞으면 휴대폰을 2차 보안 번호로 등록한다. 5회 연속 틀리면 30분 동안 429 TWO_FACTOR_LOCKED.',
  })
  @ApiOkResponse({ type: GetTwoFactorResDto })
  confirmPhoneVerification(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmPhoneVerificationReqDto,
    @Req() request: Request,
  ): Promise<GetTwoFactorResDto> {
    return this.twoFactorService.confirmPhoneVerification(
      user.userId,
      dto.phoneNumber,
      dto.code,
      clientInfo(request),
    );
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '2차 보안 해제',
    description:
      '해제 이력에 회원, 해제일시, 접속 IP·기기 정보를 남긴다. 설정하지 않은 계정이면 409 TWO_FACTOR_NOT_ENABLED.',
  })
  @ApiOkResponse({ type: GetTwoFactorResDto })
  disable(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<GetTwoFactorResDto> {
    return this.twoFactorService.disable(user.userId, clientInfo(request));
  }

  @Post('verifications')
  @ApiOperation({
    summary: '2차 보안 재인증 인증번호 발송',
    description:
      '공통 2차 보안 화면(USR-AUTH-009). 중요 기능이 403 TWO_FACTOR_REQUIRED를 내려주면 호출한다. 등록 휴대폰으로 보낸다.',
  })
  @ApiCreatedResponse({ type: SendTwoFactorVerificationResDto })
  sendVerification(
    @CurrentUser() user: AuthUser,
  ): Promise<SendTwoFactorVerificationResDto> {
    return this.twoFactorService.sendVerification(user.userId);
  }

  @Post('verifications/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '2차 보안 재인증 확인',
    description:
      '성공하면 10분(verifiedUntil) 동안 중요 기능을 다시 묻지 않는다. 막혔던 요청을 다시 보내면 된다.',
  })
  @ApiOkResponse({ type: ConfirmTwoFactorVerificationResDto })
  confirmVerification(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmTwoFactorVerificationReqDto,
  ): Promise<ConfirmTwoFactorVerificationResDto> {
    return this.twoFactorService.confirmVerification(user.userId, dto.code);
  }
}

/** 프록시(Railway)를 거치면 원래 IP는 X-Forwarded-For 맨 앞에 있다. */
export function clientInfo(request: Request): ClientInfo {
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  return {
    ipAddress: first || request.ip,
    userAgent: request.headers['user-agent'],
  };
}
