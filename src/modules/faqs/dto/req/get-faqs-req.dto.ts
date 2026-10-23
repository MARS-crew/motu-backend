import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FaqCategory } from '../../../../generated/prisma/client.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class GetFaqsReqDto {
  @ApiPropertyOptional({
    description:
      '카테고리 (TRADE 거래/주문, POINT 포인트/자산, ACCOUNT 계정/보안, LISTING 상장, ETC 기타). 비우면 전체',
    enum: FaqCategory,
  })
  @IsOptional()
  @IsEnum(FaqCategory, { message: INVALID_REQUEST_MESSAGE })
  category?: FaqCategory;
}
