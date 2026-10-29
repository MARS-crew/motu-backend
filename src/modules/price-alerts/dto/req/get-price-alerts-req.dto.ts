import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CursorPageReqDto } from '../../../../common/dto/cursor-page-req.dto.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class GetPriceAlertsReqDto extends CursorPageReqDto {
  @ApiPropertyOptional({ description: '상품 ID. 비우면 전체 상품', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  stockId?: number;
}
