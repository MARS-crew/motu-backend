import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CursorPageReqDto } from '../../../../common/dto/cursor-page-req.dto.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { OrderListStatus } from '../../orders.constants.js';

export class GetOrdersReqDto extends CursorPageReqDto {
  @ApiPropertyOptional({
    description:
      'OPEN 미체결(접수, 일부 체결) / DONE 완료(전부 체결, 취소) / ALL 전체',
    enum: OrderListStatus,
    default: OrderListStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(OrderListStatus, { message: INVALID_REQUEST_MESSAGE })
  status: OrderListStatus = OrderListStatus.OPEN;

  @ApiPropertyOptional({ description: '상품 ID. 비우면 전체 상품', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  stockId?: number;
}
