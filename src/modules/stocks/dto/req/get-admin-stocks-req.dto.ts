import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { TradeStatus } from '../../../../generated/prisma/client.js';
import {
  ADMIN_STOCK_KEYWORD_MAX_LENGTH,
  ADMIN_STOCK_MAX_PAGE_SIZE,
  ADMIN_STOCK_PAGE_SIZE,
  StockVisibility,
} from '../../stocks.constants.js';

export class GetAdminStocksReqDto {
  @ApiPropertyOptional({
    description:
      '상품명·상품 코드 부분 일치, 또는 상품 ID(18, PRD-018). 비우면 전체',
    example: 'SaaS',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(ADMIN_STOCK_KEYWORD_MAX_LENGTH, {
    message: `검색어는 ${ADMIN_STOCK_KEYWORD_MAX_LENGTH}자 이내로 입력해 주세요.`,
  })
  keyword?: string;

  @ApiPropertyOptional({
    description:
      '상품 상태 (PENDING 거래 대기, ACTIVE 거래 가능, PAUSED 거래 중지, CLOSED 거래 종료). 비우면 전체',
    enum: TradeStatus,
  })
  @IsOptional()
  @IsEnum(TradeStatus, { message: INVALID_REQUEST_MESSAGE })
  tradeStatus?: TradeStatus;

  @ApiPropertyOptional({
    description: '카테고리 코드 (GET /api/sectors). 비우면 전체',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  sectorCode?: number;

  @ApiPropertyOptional({
    description: '노출 상태 (PUBLIC 공개, PRIVATE 비공개). 비우면 전체',
    enum: StockVisibility,
  })
  @IsOptional()
  @IsEnum(StockVisibility, { message: INVALID_REQUEST_MESSAGE })
  visibility?: StockVisibility;

  @ApiPropertyOptional({ description: '페이지 (1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({
    description: `한 페이지 건수 (최대 ${ADMIN_STOCK_MAX_PAGE_SIZE})`,
    default: ADMIN_STOCK_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(ADMIN_STOCK_MAX_PAGE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = ADMIN_STOCK_PAGE_SIZE;
}
