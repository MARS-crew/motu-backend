import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { AccountsService } from './accounts.service.js';
import { GetLedgersReqDto } from './dto/req/get-ledgers-req.dto.js';
import { GetLedgersResDto } from './dto/res/get-ledgers-res.dto.js';
import { GetMyAccountResDto } from './dto/res/get-my-account-res.dto.js';
import { GetPointGrantResDto } from './dto/res/get-point-grant-res.dto.js';
import { GetPointResetResDto } from './dto/res/get-point-reset-res.dto.js';
import { GrantPointResDto } from './dto/res/grant-point-res.dto.js';
import { ResetPointResDto } from './dto/res/reset-point-res.dto.js';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts/me')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: '내 계좌 조회 (자산관리)' })
  @ApiOkResponse({ type: GetMyAccountResDto })
  getMyAccount(@CurrentUser() user: AuthUser): Promise<GetMyAccountResDto> {
    return this.accountsService.getMyAccount(user.userId);
  }

  @Get('ledgers')
  @ApiOperation({ summary: '내 포인트 변경 이력 조회' })
  @ApiOkResponse({ type: GetLedgersResDto })
  getMyLedgers(
    @CurrentUser() user: AuthUser,
    @Query() query: GetLedgersReqDto,
  ): Promise<GetLedgersResDto> {
    return this.accountsService.getLedgers(user.userId, query.page, query.size);
  }

  @Get('point-grant')
  @ApiOperation({
    summary: '추가 포인트 지급 가능 여부 조회',
    description: '마지막 지급 후 24시간이 지나야 다시 받을 수 있다.',
  })
  @ApiOkResponse({ type: GetPointGrantResDto })
  getPointGrantStatus(
    @CurrentUser() user: AuthUser,
  ): Promise<GetPointGrantResDto> {
    return this.accountsService.getPointGrantStatus(user.userId);
  }

  @Post('point-grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '추가 포인트 지급',
    description:
      '100,000P를 보유 포인트에 더한다. 24시간이 지나지 않았으면 409이고 details.nextAvailableAt에 다음 가능 시각을 담는다.',
  })
  @ApiOkResponse({ type: GrantPointResDto })
  @ApiConflictResponse({
    description: 'POINT_GRANT_TOO_SOON / ACCOUNT_CONCURRENT_UPDATE',
  })
  grantPoint(@CurrentUser() user: AuthUser): Promise<GrantPointResDto> {
    return this.accountsService.grantPoint(user.userId);
  }

  @Get('point-reset')
  @ApiOperation({
    summary: '포인트 리셋 가능 여부 조회',
    description:
      '조건별 충족 여부를 내려준다. 충족하지 못한 조건의 message를 리셋 불가 사유로 표시한다.',
  })
  @ApiOkResponse({ type: GetPointResetResDto })
  getPointResetStatus(
    @CurrentUser() user: AuthUser,
  ): Promise<GetPointResetResDto> {
    return this.accountsService.getPointResetStatus(user.userId);
  }

  @Post('point-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '포인트 리셋',
    description:
      '보유 포인트를 3,000,000P로 재설정한다. 조건을 충족하지 못하면 409이고 details.conditions에 충족하지 못한 조건을 담는다.',
  })
  @ApiOkResponse({ type: ResetPointResDto })
  @ApiConflictResponse({
    description: 'POINT_RESET_NOT_ALLOWED / ACCOUNT_CONCURRENT_UPDATE',
  })
  resetPoint(@CurrentUser() user: AuthUser): Promise<ResetPointResDto> {
    return this.accountsService.resetPoint(user.userId);
  }
}
