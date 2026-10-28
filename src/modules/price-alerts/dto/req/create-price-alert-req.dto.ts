import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { UpdatePriceAlertReqDto } from './update-price-alert-req.dto.js';

export class CreatePriceAlertReqDto extends UpdatePriceAlertReqDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  stockId: number;
}
