import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class GetListingRevisionsReqDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(100000, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(50, { message: INVALID_REQUEST_MESSAGE })
  size: number = 10;
}
