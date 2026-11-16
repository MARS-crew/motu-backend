import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
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
import {
  ADMIN_LISTING_MAX_PAGE_SIZE,
  ADMIN_LISTING_PAGE_SIZE,
  REVIEWABLE_LISTING_STATUSES,
} from '../../listing-applications.constants.js';

const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const DATE_MESSAGE = '접수 기간은 시간대를 포함한 ISO 일시로 입력해 주세요.';
const trimSearch = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class GetAdminListingApplicationsReqDto {
  @ApiPropertyOptional({
    description:
      '신청자 로그인 아이디·닉네임, 신청번호 또는 서비스명 부분 검색',
    maxLength: 30,
  })
  @IsOptional()
  @Transform(trimSearch)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(30, { message: '검색어는 30자 이내로 입력해 주세요.' })
  keyword?: string;

  @ApiPropertyOptional({
    description: '신청자 로그인 아이디 또는 닉네임 부분 검색',
    maxLength: 30,
  })
  @IsOptional()
  @Transform(trimSearch)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(30, { message: '검색어는 30자 이내로 입력해 주세요.' })
  applicant?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'GET /api/sectors에서 조회한 카테고리 코드',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  sectorCode?: number;

  @ApiPropertyOptional({ enum: [...REVIEWABLE_LISTING_STATUSES] })
  @IsOptional()
  @IsIn(REVIEWABLE_LISTING_STATUSES, { message: INVALID_REQUEST_MESSAGE })
  status?: (typeof REVIEWABLE_LISTING_STATUSES)[number];

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: '접수 기간 시작 (포함). 시작과 종료를 모두 생략하면 전체 기간',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(DATE_TIME, { message: DATE_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: '접수 기간 종료 (미포함)',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  @Matches(DATE_TIME, { message: DATE_MESSAGE })
  to?: string;

  @ApiPropertyOptional({
    type: Number,
    default: 1,
    minimum: 1,
    maximum: 100000,
  })
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(100000, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    default: ADMIN_LISTING_PAGE_SIZE,
    minimum: 1,
    maximum: ADMIN_LISTING_MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(ADMIN_LISTING_MAX_PAGE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = ADMIN_LISTING_PAGE_SIZE;
}
