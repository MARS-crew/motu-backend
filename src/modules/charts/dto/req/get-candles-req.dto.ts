import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { ChartInterval } from '../../../../generated/prisma/client.js';
import {
  DEFAULT_CANDLE_SIZE,
  MAX_CANDLE_SIZE,
} from '../../charts.constants.js';

export class GetCandlesReqDto {
  @ApiProperty({ description: '상품 ID', example: 1 })
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  stockId: number;

  @ApiProperty({
    description:
      '봉 단위 (MINUTE 분, HOUR 시간, DAY 일, WEEK 주, MONTH 월). 일·주(월요일)·월은 한국 시간 00시 기준',
    enum: ChartInterval,
    example: ChartInterval.DAY,
  })
  @IsEnum(ChartInterval, { message: INVALID_REQUEST_MESSAGE })
  interval: ChartInterval;

  @ApiPropertyOptional({
    description:
      '이전 응답의 nextCursor. 비우면 최신 봉부터, 넘기면 그보다 이전 봉을 읽는다.',
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  cursor?: string;

  @ApiPropertyOptional({
    description: `한 번에 읽을 봉 개수 (최대 ${MAX_CANDLE_SIZE})`,
    example: DEFAULT_CANDLE_SIZE,
    default: DEFAULT_CANDLE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(MAX_CANDLE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = DEFAULT_CANDLE_SIZE;
}
