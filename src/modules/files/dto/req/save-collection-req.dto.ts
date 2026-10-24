import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
export class SaveCollectionReqDto {
  @ApiProperty({
    type: [String],
    description: '서버에서 발급한 완료 자료 ID. 빈 배열은 모두 선택 해제.',
  })
  @IsArray({ message: INVALID_REQUEST_MESSAGE })
  @ArrayMaxSize(10, { message: INVALID_REQUEST_MESSAGE })
  @ArrayUnique({ message: INVALID_REQUEST_MESSAGE })
  @IsUUID('4', { each: true, message: INVALID_REQUEST_MESSAGE })
  attachmentIds: string[];
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(500, { message: INVALID_REQUEST_MESSAGE })
  description?: string;
  @ApiPropertyOptional({
    default: false,
    description: '다음 단계 이동이면 true. 증빙 설명 10~500자 검증.',
  })
  @IsOptional()
  @IsBoolean({ message: INVALID_REQUEST_MESSAGE })
  validateStep?: boolean;
}
