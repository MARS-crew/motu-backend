import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { LEDGER_PAGE_SIZE } from '../../accounts.constants.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class GetLedgersReqDto {
  @ApiPropertyOptional({
    description: '페이지 (1부터)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({
    description: '한 페이지 건수 (최대 100)',
    example: LEDGER_PAGE_SIZE,
    default: LEDGER_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(100, { message: INVALID_REQUEST_MESSAGE })
  size: number = LEDGER_PAGE_SIZE;
}
