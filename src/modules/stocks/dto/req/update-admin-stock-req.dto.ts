import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** 빈 문자열은 값을 지우는 것(null)으로 본다. */
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const METRIC_MESSAGE = '지표는 0 이상의 정수로 입력해 주세요.';
const DATE_MESSAGE = '지표 기준일은 YYYY-MM-DD 형식으로 입력해 주세요.';

/**
 * 상장 상품 정보 수정 (ADM-PRD-03). 선택 항목은 보내지 않으면 그대로 두고, null을 보내면 지운다.
 * 거래 상태는 이 요청으로 바꾸지 않는다.
 */
export class UpdateAdminStockReqDto extends AdminReasonReqDto {
  @ApiProperty({ description: '상품명 (1~30자)', example: 'SaaS Index' })
  @Transform(trim)
  @IsString({ message: '상품명을 입력해 주세요.' })
  @Length(1, 30, { message: '상품명은 1~30자로 입력해 주세요.' })
  name: string;

  @ApiProperty({
    description: '카테고리 코드 (GET /api/sectors)',
    example: 1,
  })
  @IsInt({ message: '카테고리를 선택해 주세요.' })
  @Min(1, { message: '카테고리를 선택해 주세요.' })
  sectorCode: number;

  @ApiProperty({
    description: '노출 상태 (true 공개, false 비공개)',
    example: true,
  })
  @IsBoolean({ message: '노출 상태를 선택해 주세요.' })
  isPublic: boolean;

  @ApiPropertyOptional({
    description: '한 줄 소개 (1~60자). 보내지 않으면 그대로',
    example: 'SaaS 기업 성장성 기반',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @Length(1, 60, { message: '한 줄 소개는 1~60자로 입력해 주세요.' })
  summary?: string;

  @ApiPropertyOptional({
    description: '상품 소개 (500자 이내). null이면 지운다',
    example: 'SaaS 기업의 성장성과 시장 반응을 반영한 모의투자 상품입니다.',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(500, { message: '상품 소개는 500자 이내로 입력해 주세요.' })
  description?: string | null;

  @ApiPropertyOptional({
    description: '공식 URL (https, 500자 이내). null이면 지운다',
    example: 'https://saas.example.com',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null)
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: '공식 URL은 https로 시작하는 주소로 입력해 주세요.' },
  )
  @MaxLength(500, { message: '공식 URL은 500자 이내로 입력해 주세요.' })
  officialUrl?: string | null;

  @ApiPropertyOptional({
    description: 'MAU. null이면 지운다',
    example: 120_000,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: METRIC_MESSAGE })
  @Min(0, { message: METRIC_MESSAGE })
  @Max(Number.MAX_SAFE_INTEGER, { message: METRIC_MESSAGE })
  mau?: number | null;

  @ApiPropertyOptional({
    description: '거래액. null이면 지운다',
    example: 85_000_000,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: METRIC_MESSAGE })
  @Min(0, { message: METRIC_MESSAGE })
  @Max(Number.MAX_SAFE_INTEGER, { message: METRIC_MESSAGE })
  transactionVolume?: number | null;

  @ApiPropertyOptional({
    description:
      '지표 기준일 (YYYY-MM-DD). MAU나 거래액이 있으면 필수. null이면 지운다',
    example: '2026-08-31',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString({ strict: true }, { message: DATE_MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  metricsBaseDate?: string | null;
}
