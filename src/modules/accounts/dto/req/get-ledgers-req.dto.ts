import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { LEDGER_PAGE_SIZE } from '../../accounts.constants.js';

export class GetLedgersReqDto {
  @ApiPropertyOptional({
    description: '페이지 (1부터)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: '한 페이지 건수 (최대 100)',
    example: LEDGER_PAGE_SIZE,
    default: LEDGER_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = LEDGER_PAGE_SIZE;
}
