import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { NoticeType } from '../../../../generated/prisma/client.js';

const NOTICE_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const DATE_MESSAGE = '게시 일시는 시간대를 포함한 ISO 일시로 입력해 주세요.';
const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAdminNoticeReqDto {
  @ApiProperty({ enum: NoticeType })
  @IsEnum(NoticeType, { message: INVALID_REQUEST_MESSAGE })
  type: NoticeType;

  @ApiProperty({ maxLength: 100, example: '서비스 점검 안내' })
  @Transform(trimText)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @IsNotEmpty({ message: '공지 제목을 입력해 주세요.' })
  @MaxLength(100, { message: '공지 제목은 100자 이내로 입력해 주세요.' })
  title: string;

  @ApiProperty({ example: '서비스 점검 일정을 안내드립니다.' })
  @Transform(trimText)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @IsNotEmpty({ message: '공지 내용을 입력해 주세요.' })
  content: string;

  @ApiPropertyOptional({
    default: false,
    description: '공지 목록 상단 고정 여부',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: INVALID_REQUEST_MESSAGE })
  isImportant?: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-16T09:00:00+09:00',
  })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(NOTICE_DATE_TIME, { message: DATE_MESSAGE })
  postStartDate: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '게시 종료 일시. null이면 계속 게시합니다.',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(NOTICE_DATE_TIME, { message: DATE_MESSAGE })
  postEndDate?: string | null;
}
