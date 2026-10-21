import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetWishlistsReqDto } from './dto/req/get-wishlists-req.dto.js';
import { GetWishlistsResDto } from './dto/res/get-wishlists-res.dto.js';
import { StocksService } from './stocks.service.js';

@ApiTags('Wishlists')
@ApiBearerAuth()
@Controller('wishlists')
export class WishlistsController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  @ApiOperation({
    summary: '관심 상품 목록',
    description: '최근에 추가한 순서. 상품 목록과 같은 형식이다.',
  })
  @ApiOkResponse({ type: GetWishlistsResDto })
  @ApiBadRequestResponse({ description: 'STOCK_INVALID_CURSOR' })
  getWishlists(
    @CurrentUser() user: AuthUser,
    @Query() query: GetWishlistsReqDto,
  ): Promise<GetWishlistsResDto> {
    return this.stocksService.getWishlists(user.userId, query);
  }

  @Put(':stockId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '관심상품 등록',
    description: '이미 등록된 상품이어도 204다.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'STOCK_NOT_FOUND' })
  addWishlist(
    @CurrentUser() user: AuthUser,
    @Param('stockId', ParseIdPipe) stockId: number,
  ): Promise<void> {
    return this.stocksService.addWishlist(user.userId, stockId);
  }

  @Delete(':stockId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '관심상품 해제',
    description: '등록되어 있지 않은 상품이어도 204다.',
  })
  @ApiNoContentResponse()
  removeWishlist(
    @CurrentUser() user: AuthUser,
    @Param('stockId', ParseIdPipe) stockId: number,
  ): Promise<void> {
    return this.stocksService.removeWishlist(user.userId, stockId);
  }
}
