import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { Role } from '../../generated/prisma/client.js';
import { PointCooldownType } from './accounts.constants.js';
import { AccountsService } from './accounts.service.js';
import { AdjustCashReqDto } from './dto/req/adjust-cash-req.dto.js';
import { GetLedgersReqDto } from './dto/req/get-ledgers-req.dto.js';
import { AdjustCashResDto } from './dto/res/adjust-cash-res.dto.js';
import { GetAccountResDto } from './dto/res/get-account-res.dto.js';
import { GetLedgersResDto } from './dto/res/get-ledgers-res.dto.js';

@ApiTags('Admin - Accounts')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
@Controller('admin/accounts/:userId')
export class AccountsAdminController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: '회원 계좌 조회' })
  @ApiOkResponse({ type: GetAccountResDto })
  getAccount(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<GetAccountResDto> {
    return this.accountsService.getAccount(userId);
  }

  @Get('ledgers')
  @ApiOperation({ summary: '회원 포인트 변경 이력 조회' })
  @ApiOkResponse({ type: GetLedgersResDto })
  getLedgers(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: GetLedgersReqDto,
  ): Promise<GetLedgersResDto> {
    return this.accountsService.getLedgers(userId, query.page, query.size);
  }

  @Patch('cash')
  @ApiOperation({
    summary: '회원 포인트 지급/차감',
    description:
      'amount가 양수면 지급, 음수면 차감한다. 이력은 ADJUST로 남는다.',
  })
  @ApiOkResponse({ type: AdjustCashResDto })
  @ApiBadRequestResponse({ description: 'ACCOUNT_INSUFFICIENT_CASH' })
  adjustCash(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AdjustCashReqDto,
  ): Promise<AdjustCashResDto> {
    return this.accountsService.adjustCash(userId, dto.amount);
  }

  @Delete('cooldowns/:type')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '추가 지급 / 리셋 대기시간 초기화',
    description: '테스트용. grant는 24시간, reset은 7일 제한을 바로 풀어준다.',
  })
  @ApiParam({ name: 'type', enum: PointCooldownType })
  @ApiNoContentResponse()
  clearPointCooldown(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('type', new ParseEnumPipe(PointCooldownType))
    type: PointCooldownType,
  ): Promise<void> {
    return this.accountsService.clearPointCooldown(userId, type);
  }
}
