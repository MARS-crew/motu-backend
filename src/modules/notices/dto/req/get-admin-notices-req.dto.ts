import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { NoticeType } from '../../../../generated/prisma/client.js';
import {
  NOTICE_DATE_MESSAGE,
  NOTICE_DATE_TIME,
} from '../../notices.constants.js';
import { AdminNoticeStatus } from '../res/admin-notice-res.dto.js';
import { GetNoticesReqDto } from './get-notices-req.dto.js';

export class GetAdminNoticesReqDto extends GetNoticesReqDto {
  @ApiPropertyOptional({
    type: Number,
    default: 1,
    minimum: 1,
    maximum: 100000,
  })
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(100000, { message: INVALID_REQUEST_MESSAGE })
  override page: number = 1;

  @ApiPropertyOptional({
    description: '제목 부분 일치 또는 숫자 공지 ID 정확히 일치',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(100, { message: INVALID_REQUEST_MESSAGE })
  keyword?: string;

  @ApiPropertyOptional({
    enum: NoticeType,
    description: 'ALL 전체 서비스 공지, STOCK 상품별 공지',
  })
  @IsOptional()
  @IsEnum(NoticeType, { message: INVALID_REQUEST_MESSAGE })
  type?: NoticeType;

  @ApiPropertyOptional({
    enum: AdminNoticeStatus,
    description: '삭제 공지는 DELETED 지정 시 조회',
  })
  @IsOptional()
  @IsEnum(AdminNoticeStatus, { message: INVALID_REQUEST_MESSAGE })
  status?: AdminNoticeStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: '기간 시작 (포함)',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: NOTICE_DATE_MESSAGE })
  @Matches(NOTICE_DATE_TIME, { message: NOTICE_DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: '기간 종료 (미포함)',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: NOTICE_DATE_MESSAGE })
  @Matches(NOTICE_DATE_TIME, { message: NOTICE_DATE_MESSAGE })
  to?: string;
}
