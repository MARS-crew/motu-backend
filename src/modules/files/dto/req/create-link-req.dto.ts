import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
export class CreateLinkReqDto {
  @ApiProperty({ example: 'https://example.com/evidence' })
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(2048, { message: INVALID_REQUEST_MESSAGE })
  url: string;
}
