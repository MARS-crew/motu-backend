import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class GetListingDraftsReqDto {
  @ApiPropertyOptional({
    description: '진입 화면은 limit=2, 전체 보기는 5',
    minimum: 1,
    maximum: 5,
    default: 5,
  })
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(5, { message: INVALID_REQUEST_MESSAGE })
  limit: number = 5;
}
