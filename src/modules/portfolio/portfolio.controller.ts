import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { GetPortfolioResDto } from './dto/res/get-portfolio-res.dto.js';
import { PortfolioService } from './portfolio.service.js';

@ApiTags('Portfolio')
@ApiBearerAuth()
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  @ApiOperation({
    summary: '내 포트폴리오',
    description:
      '총 자산, 예수금, 평가금액, 평가손익·수익률, 자산 구성 비율, 보유 종목을 현재가 기준으로 계산한다.',
  })
  @ApiOkResponse({ type: GetPortfolioResDto })
  @ApiNotFoundResponse({ description: 'ACCOUNT_NOT_FOUND' })
  getPortfolio(@CurrentUser() user: AuthUser): Promise<GetPortfolioResDto> {
    return this.portfolioService.getPortfolio(user.userId);
  }
}
