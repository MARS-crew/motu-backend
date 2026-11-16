import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { GetNoticesReqDto } from './get-notices-req.dto.js';

export class GetAdminNoticesReqDto extends GetNoticesReqDto {
  @ApiPropertyOptional({
    type: Number,
    default: 1,
    minimum: 1,
    maximum: 100000,
  })
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(100000, { message: INVALID_REQUEST_MESSAGE })
  override page: number = 1;
}
