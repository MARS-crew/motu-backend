import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { ChangeContactPhoneReqDto } from './dto/req/change-contact-phone-req.dto.js';
import { CheckLoginIdReqDto } from './dto/req/check-login-id-req.dto.js';
import { CheckNicknameReqDto } from './dto/req/check-nickname-req.dto.js';
import { ConfirmContactPhoneVerificationReqDto } from './dto/req/confirm-contact-phone-verification-req.dto.js';
import { ConfirmEmailVerificationReqDto } from './dto/req/confirm-email-verification-req.dto.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { SendContactPhoneVerificationReqDto } from './dto/req/send-contact-phone-verification-req.dto.js';
import { SendEmailVerificationReqDto } from './dto/req/send-email-verification-req.dto.js';
import { UpdateMyInfoReqDto } from './dto/req/update-my-info-req.dto.js';
import { WithdrawUserReqDto } from './dto/req/withdraw-user-req.dto.js';
import { CheckAvailabilityResDto } from './dto/res/check-availability-res.dto.js';
import { ConfirmContactPhoneVerificationResDto } from './dto/res/confirm-contact-phone-verification-res.dto.js';
import { ConfirmEmailVerificationResDto } from './dto/res/confirm-email-verification-res.dto.js';
import { ConfirmProfileEmailVerificationResDto } from './dto/res/confirm-profile-email-verification-res.dto.js';
import { CreateUserResDto } from './dto/res/create-user-res.dto.js';
import { GetMyInfoResDto } from './dto/res/get-my-info-res.dto.js';
import { SendContactPhoneVerificationResDto } from './dto/res/send-contact-phone-verification-res.dto.js';
import { SendEmailVerificationResDto } from './dto/res/send-email-verification-res.dto.js';
import { UpdateMyInfoResDto } from './dto/res/update-my-info-res.dto.js';
import { UsersWithdrawalService } from './users-withdrawal.service.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly withdrawalService: UsersWithdrawalService,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiOkResponse({ type: GetMyInfoResDto })
  getMyInfo(@CurrentUser() user: AuthUser): Promise<GetMyInfoResDto> {
    return this.usersService.getMyInfo(user.userId);
  }

  @Post('me/email-verifications')
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원정보 수정 이메일 인증번호 발송',
    description:
      '마이페이지 회원정보 수정 전 인증(USR-MY-02). 입력한 이메일이 가입 이메일과 같을 때만 인증번호를 보낸다. 재발송은 30초 후 가능하다.',
  })
  @ApiCreatedResponse({ type: SendEmailVerificationResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST / USER_EMAIL_MISMATCH' })
  @ApiTooManyRequestsResponse({ description: 'VERIFICATION_RESEND_TOO_SOON' })
  sendProfileEmailCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendEmailVerificationReqDto,
  ): Promise<SendEmailVerificationResDto> {
    return this.usersService.sendProfileEmailCode(user.userId, dto.email);
  }

  @Post('me/email-verifications/confirm')
  @Roles(Role.USER)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원정보 수정 이메일 인증 확인',
    description:
      '인증번호가 맞으면 editableUntil까지 회원정보 수정(PATCH /api/users/me)을 한 번 할 수 있다.',
  })
  @ApiOkResponse({ type: ConfirmProfileEmailVerificationResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / USER_EMAIL_MISMATCH / VERIFICATION_CODE_MISMATCH / VERIFICATION_EXPIRED',
  })
  @ApiNotFoundResponse({ description: 'VERIFICATION_NOT_FOUND' })
  @ApiTooManyRequestsResponse({ description: 'VERIFICATION_ATTEMPTS_EXCEEDED' })
  confirmProfileEmailCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmEmailVerificationReqDto,
  ): Promise<ConfirmProfileEmailVerificationResDto> {
    return this.usersService.confirmProfileEmailCode(
      user.userId,
      dto.email,
      dto.code,
    );
  }

  @Patch('me')
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원정보 수정',
    description:
      '가입 이메일 인증 후 비밀번호·생년월일을 바꾼다(USR-MY-03). 바꿀 항목만 보낸다. 인증 결과는 한 번만 쓰인다. 비밀번호를 바꾸면 모든 기기에서 로그아웃되고 reloginRequired가 true다.',
  })
  @ApiOkResponse({ type: UpdateMyInfoResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / USER_NOTHING_TO_UPDATE / USER_SAME_PASSWORD / VERIFICATION_REQUIRED',
  })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  updateMyInfo(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyInfoReqDto,
  ): Promise<UpdateMyInfoResDto> {
    return this.usersService.updateMyInfo(user.userId, dto);
  }

  @Post('me/withdrawal')
  @Roles(Role.USER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '회원 탈퇴',
    description:
      '탈퇴 사유를 받아 미체결 주문을 취소하고 포인트를 소멸시킨 뒤 회원 탈퇴를 처리한다. 승인된 거래 대기 상품이 있으면 409를 반환한다.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'BAD_REQUEST' })
  @ApiUnauthorizedResponse({
    description: 'AUTH_UNAUTHORIZED / AUTH_TOKEN_EXPIRED',
  })
  @ApiForbiddenResponse({
    description: 'AUTH_FORBIDDEN / AUTH_ACCOUNT_LOCKED / AUTH_ACCOUNT_BLOCKED',
  })
  @ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'USER_WITHDRAWAL_PENDING_LISTING / USER_STATUS_CONFLICT / ACCOUNT_CONCURRENT_UPDATE / ACCOUNT_WITHDRAWAL_LOCKED_CASH',
  })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Body() dto: WithdrawUserReqDto,
  ): Promise<void> {
    return this.withdrawalService.withdraw(user.userId, dto.reason);
  }

  @Post('me/phone-verifications')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '연락처 변경 인증번호 발송',
    description:
      '마이페이지 연락처 변경. 2차 보안을 설정한 회원만 쓸 수 있고, 아니면 403 USER_CONTACT_TWO_FACTOR_REQUIRED. 새 번호로 SMS 인증번호를 보낸다. 재발송은 30초 후 가능하다.',
  })
  @ApiCreatedResponse({ type: SendContactPhoneVerificationResDto })
  @ApiForbiddenResponse({ description: 'USER_CONTACT_TWO_FACTOR_REQUIRED' })
  @ApiConflictResponse({ description: 'USER_SAME_PHONE_NUMBER' })
  sendContactPhoneCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendContactPhoneVerificationReqDto,
  ): Promise<SendContactPhoneVerificationResDto> {
    return this.usersService.sendContactPhoneCode(user.userId, dto.phoneNumber);
  }

  @Post('me/phone-verifications/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '연락처 변경 인증번호 확인',
    description: '새 번호로 받은 인증번호를 확인하고 인증 결과를 반환한다.',
  })
  @ApiOkResponse({ type: ConfirmContactPhoneVerificationResDto })
  @ApiBadRequestResponse({
    description:
      'BAD_REQUEST / VERIFICATION_CODE_MISMATCH / VERIFICATION_EXPIRED',
  })
  @ApiForbiddenResponse({ description: 'USER_CONTACT_TWO_FACTOR_REQUIRED' })
  @ApiNotFoundResponse({
    description: 'USER_NOT_FOUND / VERIFICATION_NOT_FOUND',
  })
  @ApiConflictResponse({ description: 'USER_SAME_PHONE_NUMBER' })
  @ApiTooManyRequestsResponse({ description: 'VERIFICATION_ATTEMPTS_EXCEEDED' })
  confirmContactPhoneCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmContactPhoneVerificationReqDto,
  ): Promise<ConfirmContactPhoneVerificationResDto> {
    return this.usersService.confirmContactPhoneCode(
      user.userId,
      dto.phoneNumber,
      dto.code,
    );
  }

  @Patch('me/phone-number')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '인증된 연락처로 변경',
    description:
      '인증이 완료된 번호로 연락처를 변경한다. 인증 결과는 저장에 한 번 사용한다. 2차 보안용 번호는 별도로 관리한다.',
  })
  @ApiOkResponse({ type: GetMyInfoResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST / VERIFICATION_REQUIRED' })
  @ApiForbiddenResponse({ description: 'USER_CONTACT_TWO_FACTOR_REQUIRED' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'USER_SAME_PHONE_NUMBER / USER_STATUS_CONFLICT',
  })
  changeContactPhone(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeContactPhoneReqDto,
  ): Promise<GetMyInfoResDto> {
    return this.usersService.changeContactPhone(user.userId, dto.phoneNumber);
  }

  @Public()
  @Get('login-id/availability')
  @ApiOperation({ summary: '아이디 중복 확인' })
  @ApiOkResponse({ type: CheckAvailabilityResDto })
  checkLoginId(
    @Query() query: CheckLoginIdReqDto,
  ): Promise<CheckAvailabilityResDto> {
    return this.usersService.checkLoginId(query.loginId);
  }

  @Public()
  @Get('nickname/availability')
  @ApiOperation({ summary: '닉네임 중복 확인' })
  @ApiOkResponse({ type: CheckAvailabilityResDto })
  checkNickname(
    @Query() query: CheckNicknameReqDto,
  ): Promise<CheckAvailabilityResDto> {
    return this.usersService.checkNickname(query.nickname);
  }

  @Public()
  @Post('email-verifications')
  @ApiOperation({
    summary: '가입 이메일 인증번호 발송',
    description:
      '이미 가입된 이메일이면 409. 재발송은 30초 후 가능하며 이전 인증번호는 무효가 된다.',
  })
  @ApiCreatedResponse({ type: SendEmailVerificationResDto })
  @ApiConflictResponse({ description: 'EMAIL_DUPLICATED' })
  sendEmailVerification(
    @Body() dto: SendEmailVerificationReqDto,
  ): Promise<SendEmailVerificationResDto> {
    return this.usersService.sendSignupEmailCode(dto.email);
  }

  @Public()
  @Post('email-verifications/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '가입 이메일 인증번호 확인',
    description:
      '인증번호는 5분간 유효하고 5회까지 입력할 수 있다. 인증 후 30분 안에 회원가입을 완료해야 한다.',
  })
  @ApiOkResponse({ type: ConfirmEmailVerificationResDto })
  async confirmEmailVerification(
    @Body() dto: ConfirmEmailVerificationReqDto,
  ): Promise<ConfirmEmailVerificationResDto> {
    await this.usersService.confirmSignupEmailCode(dto.email, dto.code);
    return { verified: true };
  }

  @Public()
  @Post()
  @ApiOperation({
    summary: '회원가입',
    description:
      '이메일 인증을 마친 뒤 호출한다. 가입 시 계좌가 만들어지고 초기 포인트 3,000,000P가 지급된다.',
  })
  @ApiCreatedResponse({ type: CreateUserResDto })
  @ApiConflictResponse({
    description: 'LOGIN_ID_DUPLICATED / NICKNAME_DUPLICATED / EMAIL_DUPLICATED',
  })
  create(@Body() dto: CreateUserReqDto): Promise<CreateUserResDto> {
    return this.usersService.create(dto);
  }
}
