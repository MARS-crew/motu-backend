import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FaqCategoryFilter } from '../../faqs.constants.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class GetFaqsReqDto {
  @ApiPropertyOptional({
    description:
      '필터 (ALL 전체, TRADE 거래/주문, POINT 포인트/자산, ACCOUNT 계정/보안, LISTING 상장, ETC 기타)',
    enum: FaqCategoryFilter,
    default: FaqCategoryFilter.ALL,
  })
  @IsOptional()
  @IsEnum(FaqCategoryFilter, { message: INVALID_REQUEST_MESSAGE })
  category: FaqCategoryFilter = FaqCategoryFilter.ALL;
}
