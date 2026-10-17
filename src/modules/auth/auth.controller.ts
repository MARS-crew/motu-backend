import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { AuthService } from './auth.service.js';
import { ConfirmLoginIdVerificationReqDto } from './dto/req/confirm-login-id-verification-req.dto.js';
import { LoginReqDto } from './dto/req/login-req.dto.js';
import { LogoutReqDto } from './dto/req/logout-req.dto.js';
import { RefreshTokenReqDto } from './dto/req/refresh-token-req.dto.js';
import { RequestPasswordResetReqDto } from './dto/req/request-password-reset-req.dto.js';
import { ResetPasswordReqDto } from './dto/req/reset-password-req.dto.js';
import { SendLoginIdVerificationReqDto } from './dto/req/send-login-id-verification-req.dto.js';
import { VerifyPasswordResetReqDto } from './dto/req/verify-password-reset-req.dto.js';
import { FindLoginIdResDto } from './dto/res/find-login-id-res.dto.js';
import { LoginResDto } from './dto/res/login-res.dto.js';
import { RefreshTokenResDto } from './dto/res/refresh-token-res.dto.js';
import { SendLoginIdVerificationResDto } from './dto/res/send-login-id-verification-res.dto.js';
import { VerifyPasswordResetResDto } from './dto/res/verify-password-reset-res.dto.js';

@ApiTags('Auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '로그인',
    description:
      '비밀번호를 틀리면 401 AUTH_INVALID_CREDENTIALS와 `details.failCount`를 내려준다. 5회째 틀리면 계정이 잠기고 403 AUTH_ACCOUNT_LOCKED를 내려준다.',
  })
  @ApiOkResponse({ type: LoginResDto })
  login(@Body() dto: LoginReqDto): Promise<LoginResDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '토큰 재발급',
    description:
      'Access 토큰이 만료(AUTH_TOKEN_EXPIRED)되면 호출한다. Refresh 토큰도 새 값으로 바뀌므로 응답의 토큰으로 교체해야 한다.',
  })
  @ApiOkResponse({ type: RefreshTokenResDto })
  refresh(@Body() dto: RefreshTokenReqDto): Promise<RefreshTokenResDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '로그아웃',
    description: '전달한 Refresh 토큰을 폐기한다.',
  })
  async logout(@Body() dto: LogoutReqDto): Promise<null> {
    await this.authService.logout(dto.refreshToken);
    return null;
  }

  @Post('find-login-id/email-verifications')
  @ApiOperation({
    summary: '아이디 찾기 인증번호 발송',
    description:
      '가입된 이메일이 아니면 404 AUTH_EMAIL_NOT_REGISTERED. 재발송은 30초 후 가능하다.',
  })
  @ApiCreatedResponse({ type: SendLoginIdVerificationResDto })
  sendFindLoginIdCode(
    @Body() dto: SendLoginIdVerificationReqDto,
  ): Promise<SendLoginIdVerificationResDto> {
    return this.authService.sendFindLoginIdCode(dto.email);
  }

  @Post('find-login-id/email-verifications/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '아이디 찾기 인증번호 확인',
    description: '인증에 성공하면 일부를 가린 아이디를 내려준다.',
  })
  @ApiOkResponse({ type: FindLoginIdResDto })
  findLoginId(
    @Body() dto: ConfirmLoginIdVerificationReqDto,
  ): Promise<FindLoginIdResDto> {
    return this.authService.findLoginId(dto.email, dto.code);
  }

  @Post('password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '비밀번호 재설정 링크 발송',
    description:
      '아이디와 가입 이메일이 맞는 정상 계정이면 재설정 링크를 메일로 보낸다. 가입 여부를 노출하지 않도록 결과와 관계없이 같은 응답을 내려준다.',
  })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetReqDto,
  ): Promise<null> {
    await this.authService.requestPasswordReset(dto.loginId, dto.email);
    return null;
  }

  @Post('password-reset/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '재설정 링크 확인',
    description:
      '재설정 화면을 열 때 호출한다. 만료되었거나 사용한 링크면 400 AUTH_INVALID_PASSWORD_RESET_TOKEN.',
  })
  @ApiOkResponse({ type: VerifyPasswordResetResDto })
  async verifyPasswordReset(
    @Body() dto: VerifyPasswordResetReqDto,
  ): Promise<VerifyPasswordResetResDto> {
    await this.authService.verifyPasswordResetToken(dto.token);
    return { valid: true };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '새 비밀번호 설정',
    description:
      '비밀번호를 바꾸고 모든 기기에서 로그아웃시킨다. 링크는 한 번만 사용할 수 있다.',
  })
  async resetPassword(@Body() dto: ResetPasswordReqDto): Promise<null> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return null;
  }
}
