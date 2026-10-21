import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../constants/validation.constants.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/**
 * 커서 페이지네이션 요청. 첫 페이지는 cursor 없이 호출하고,
 * 다음 페이지는 이전 응답의 nextCursor를 그대로 넘긴다.
 */
export class CursorPageReqDto {
  @ApiPropertyOptional({
    description: '이전 응답의 nextCursor. 첫 페이지는 비운다.',
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  cursor?: string;

  @ApiPropertyOptional({
    description: `한 페이지 건수 (최대 ${MAX_PAGE_SIZE})`,
    example: DEFAULT_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(MAX_PAGE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = DEFAULT_PAGE_SIZE;
}
