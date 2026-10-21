import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CursorPageReqDto } from '../../../../common/dto/cursor-page-req.dto.js';
import { StockSort } from '../../stocks.constants.js';

export class GetStocksReqDto extends CursorPageReqDto {
  @ApiPropertyOptional({
    description: '카테고리 코드. 비우면 전체',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sectorCode?: number;

  @ApiPropertyOptional({
    description:
      '정렬 (TRADE_AMOUNT 거래대금순, CHANGE_RATE_DESC 등락률 높은순, CHANGE_RATE_ASC 등락률 낮은순, VOLUME 거래량순, LISTING_DATE 최근 상장순)',
    enum: StockSort,
    default: StockSort.TRADE_AMOUNT,
  })
  @IsOptional()
  @IsEnum(StockSort)
  sort: StockSort = StockSort.TRADE_AMOUNT;
}
