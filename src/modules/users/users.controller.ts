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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { CheckLoginIdReqDto } from './dto/req/check-login-id-req.dto.js';
import { CheckNicknameReqDto } from './dto/req/check-nickname-req.dto.js';
import { ConfirmContactPhoneVerificationReqDto } from './dto/req/confirm-contact-phone-verification-req.dto.js';
import { ConfirmEmailVerificationReqDto } from './dto/req/confirm-email-verification-req.dto.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { SendContactPhoneVerificationReqDto } from './dto/req/send-contact-phone-verification-req.dto.js';
import { SendEmailVerificationReqDto } from './dto/req/send-email-verification-req.dto.js';
import { CheckAvailabilityResDto } from './dto/res/check-availability-res.dto.js';
import { ConfirmEmailVerificationResDto } from './dto/res/confirm-email-verification-res.dto.js';
import { CreateUserResDto } from './dto/res/create-user-res.dto.js';
import { GetMyInfoResDto } from './dto/res/get-my-info-res.dto.js';
import { SendContactPhoneVerificationResDto } from './dto/res/send-contact-phone-verification-res.dto.js';
import { SendEmailVerificationResDto } from './dto/res/send-email-verification-res.dto.js';
import { UsersService } from './users.service.js';
import { ChangeNicknameReqDto } from './dto/req/change-nickname-req.dto.js';
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiOkResponse({ type: GetMyInfoResDto })
  getMyInfo(@CurrentUser() user: AuthUser): Promise<GetMyInfoResDto> {
    return this.usersService.getMyInfo(user.userId);
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
    summary: '연락처 변경 인증 확인 및 변경',
    description:
      '인증번호가 맞으면 연락처를 바꾸고 바뀐 내 정보를 내려준다. 2차 보안 번호는 바뀌지 않는다.',
  })
  @ApiOkResponse({ type: GetMyInfoResDto })
  @ApiForbiddenResponse({ description: 'USER_CONTACT_TWO_FACTOR_REQUIRED' })
  @ApiConflictResponse({ description: 'USER_SAME_PHONE_NUMBER' })
  changeContactPhone(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmContactPhoneVerificationReqDto,
  ): Promise<GetMyInfoResDto> {
    return this.usersService.changeContactPhone(
      user.userId,
      dto.phoneNumber,
      dto.code,
    );
  }
  @Patch('me/nickname')
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 닉네임 변경' })
  @ApiOkResponse({ type: GetMyInfoResDto })
  @ApiBadRequestResponse({ description: 'BAD_REQUEST' })
  @ApiConflictResponse({ description: 'NICKNAME_DUPLICATED' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  changeNickname(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeNicknameReqDto,
  ): Promise<GetMyInfoResDto> {
    return this.usersService.changeNickname(user.userId, dto.nickname);
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
