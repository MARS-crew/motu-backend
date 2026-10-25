import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { ListingDraftDataReqDto } from './listing-draft-data-req.dto.js';

export class SaveListingDraftReqDto {
  @ApiPropertyOptional({
    description: '마지막 저장 단계 (1 기본 정보, 2 평가·거래, 3 지표, 4 증빙)',
    minimum: 1,
    maximum: 4,
    default: 1,
  })
  @IsOptional()
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(4, { message: INVALID_REQUEST_MESSAGE })
  currentStep?: number;

  @ApiPropertyOptional({
    type: ListingDraftDataReqDto,
    description: '변경할 필드만 전달. 생략한 필드는 유지, null은 초기화.',
  })
  @IsOptional()
  @IsObject({ message: INVALID_REQUEST_MESSAGE })
  @ValidateNested({ message: INVALID_REQUEST_MESSAGE })
  @Type(() => ListingDraftDataReqDto)
  data?: ListingDraftDataReqDto;
}
