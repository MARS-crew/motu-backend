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
export class SaveCollectionReqDto {
  @ApiProperty({
    type: [String],
    description: '서버에서 발급한 완료 자료 ID. 빈 배열은 모두 선택 해제.',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  attachmentIds: string[];
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional({
    default: false,
    description: '다음 단계 이동이면 true. 증빙 설명 10~500자 검증.',
  })
  @IsOptional()
  @IsBoolean()
  validateStep?: boolean;
}
