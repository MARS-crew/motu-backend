import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginReqDto } from './dto/req/login-req.dto.js';
import { LogoutReqDto } from './dto/req/logout-req.dto.js';
import { RefreshTokenReqDto } from './dto/req/refresh-token-req.dto.js';
import { LoginResDto } from './dto/res/login-res.dto.js';
import { RefreshTokenResDto } from './dto/res/refresh-token-res.dto.js';

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
}
