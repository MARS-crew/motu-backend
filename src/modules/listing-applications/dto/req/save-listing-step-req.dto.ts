import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, ValidateNested } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { ListingDraftDataReqDto } from './listing-draft-data-req.dto.js';

export class SaveListingStepReqDto {
  @ApiProperty({
    type: ListingDraftDataReqDto,
    description:
      '현재 단계의 변경 필드. 기존 값과 병합한 뒤 해당 단계를 검증한다.',
  })
  @IsDefined({ message: INVALID_REQUEST_MESSAGE })
  @IsObject({ message: INVALID_REQUEST_MESSAGE })
  @ValidateNested({ message: INVALID_REQUEST_MESSAGE })
  @Type(() => ListingDraftDataReqDto)
  data: ListingDraftDataReqDto;
}
