import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CheckLoginIdReqDto } from './dto/req/check-login-id-req.dto.js';
import { CheckNicknameReqDto } from './dto/req/check-nickname-req.dto.js';
import { ConfirmEmailVerificationReqDto } from './dto/req/confirm-email-verification-req.dto.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { SendEmailVerificationReqDto } from './dto/req/send-email-verification-req.dto.js';
import { CheckAvailabilityResDto } from './dto/res/check-availability-res.dto.js';
import { ConfirmEmailVerificationResDto } from './dto/res/confirm-email-verification-res.dto.js';
import { CreateUserResDto } from './dto/res/create-user-res.dto.js';
import { SendEmailVerificationResDto } from './dto/res/send-email-verification-res.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('login-id/availability')
  @ApiOperation({ summary: '아이디 중복 확인' })
  @ApiOkResponse({ type: CheckAvailabilityResDto })
  checkLoginId(
    @Query() query: CheckLoginIdReqDto,
  ): Promise<CheckAvailabilityResDto> {
    return this.usersService.checkLoginId(query.loginId);
  }

  @Get('nickname/availability')
  @ApiOperation({ summary: '닉네임 중복 확인' })
  @ApiOkResponse({ type: CheckAvailabilityResDto })
  checkNickname(
    @Query() query: CheckNicknameReqDto,
  ): Promise<CheckAvailabilityResDto> {
    return this.usersService.checkNickname(query.nickname);
  }

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
