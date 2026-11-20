import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE as M } from '../../../../common/constants/validation.constants.js';
import {
  InquiryStatus,
  InquiryType,
} from '../../../../generated/prisma/client.js';
export class GetAdminInquiriesReqDto {
  @ApiPropertyOptional({ description: '접수번호 부분 검색', maxLength: 32 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: M })
  @MaxLength(32, { message: M })
  keyword?: string;
  @ApiPropertyOptional({
    enum: InquiryStatus,
    description: 'COMPLETED는 답변 처리 완료',
  })
  @IsOptional()
  @IsEnum(InquiryStatus, { message: M })
  status?: InquiryStatus;
  @ApiPropertyOptional({ enum: InquiryType })
  @IsOptional()
  @IsEnum(InquiryType, { message: M })
  inquiryType?: InquiryType;
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt({ message: M })
  @Min(1, { message: M })
  @Max(100000, { message: M })
  page: number = 1;
  @ApiPropertyOptional({ type: Number, default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt({ message: M })
  @Min(1, { message: M })
  @Max(100, { message: M })
  size: number = 20;
}
export class GetAdminInquiryDetailReqDto {
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt({ message: M })
  @Min(1, { message: M })
  @Max(100000, { message: M })
  attemptPage: number = 1;
  @ApiPropertyOptional({ type: Number, default: 10, maximum: 50 })
  @Type(() => Number)
  @IsInt({ message: M })
  @Min(1, { message: M })
  @Max(50, { message: M })
  attemptSize: number = 10;
}
