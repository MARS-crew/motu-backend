import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { NoticeType } from '../../../../generated/prisma/client.js';
import {
  NOTICE_DATE_MESSAGE,
  NOTICE_DATE_TIME,
} from '../../notices.constants.js';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateAdminNoticeReqDto {
  @ApiPropertyOptional({ enum: NoticeType })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(NoticeType, { message: INVALID_REQUEST_MESSAGE })
  type?: NoticeType;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: '상품별 공지의 대상 상품 ID',
  })
  @IsOptional()
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(2147483647, { message: INVALID_REQUEST_MESSAGE })
  stockId?: number | null;

  @ApiPropertyOptional({ maxLength: 100, example: '서비스 점검 안내' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimText)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(100, { message: '공지 제목은 100자 이내로 입력해 주세요.' })
  title?: string;

  @ApiPropertyOptional({ example: '서비스 점검 일정을 안내드립니다.' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimText)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  content?: string;

  @ApiPropertyOptional({
    default: false,
    description: '공지 목록 상단 고정 여부',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: INVALID_REQUEST_MESSAGE })
  isImportant?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: NOTICE_DATE_MESSAGE })
  @Matches(NOTICE_DATE_TIME, { message: NOTICE_DATE_MESSAGE })
  postStartDate?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: NOTICE_DATE_MESSAGE })
  @Matches(NOTICE_DATE_TIME, { message: NOTICE_DATE_MESSAGE })
  postEndDate?: string | null;
}
