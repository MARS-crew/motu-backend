import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';
import { INVALID_REQUEST_MESSAGE as MESSAGE } from '../../../../common/constants/validation.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ApproveListingReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description: '최종 상장가. 양의 정수 문자열',
    example: '10000',
  })
  @IsString({ message: MESSAGE })
  @Matches(/^[1-9]\d{0,18}$/, { message: MESSAGE })
  finalPrice: string;

  @ApiProperty({
    description: '총 발행량. 양의 정수 문자열',
    example: '100000',
  })
  @IsString({ message: MESSAGE })
  @Matches(/^[1-9]\d{0,18}$/, { message: MESSAGE })
  totalIssuedQuantity: string;

  @ApiProperty({
    description: '확정 상장일. 한국 시간의 날짜(YYYY-MM-DD)',
    example: '2026-12-01',
  })
  @IsString({ message: MESSAGE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: MESSAGE })
  listingDate: string;

  @ApiProperty({
    description: '거래 시작일시. 시간대 필수, 미래 일시',
    example: '2026-12-01T09:00:00+09:00',
  })
  @IsString({ message: MESSAGE })
  @MaxLength(40, { message: MESSAGE })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/, { message: MESSAGE })
  @IsISO8601({ strict: true }, { message: MESSAGE })
  tradingStartAt: string;

  @ApiPropertyOptional({
    description: '희망 상장가와 최종 상장가가 다를 때 필수',
    maxLength: 200,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString({ message: MESSAGE })
  @Length(1, 200, { message: MESSAGE })
  priceAdjustmentReason?: string;
}

export class RequestListingRevisionReqDto {
  @ApiProperty({
    description: '보완이 필요한 항목명(1~10개, 항목당 1~100자)',
    example: ['증빙자료'],
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : item,
        )
      : value,
  )
  @IsArray({ message: MESSAGE })
  @ArrayMinSize(1, { message: MESSAGE })
  @ArrayMaxSize(10, { message: MESSAGE })
  @ArrayUnique({ message: MESSAGE })
  @IsString({ each: true, message: MESSAGE })
  @Length(1, 100, { each: true, message: MESSAGE })
  requestItems: string[];

  @ApiProperty({
    description: '보완 요청 내용. 1~2000자',
    example: '서비스 지표를 확인할 수 있는 최신 증빙자료를 첨부해 주세요.',
  })
  @Transform(trim)
  @IsString({ message: MESSAGE })
  @Length(1, 2000, { message: MESSAGE })
  requestContent: string;

  @ApiProperty({
    description: '보완 기한. 시간대가 포함된 미래 일시',
    example: '2026-12-07T23:59:59+09:00',
  })
  @IsString({ message: MESSAGE })
  @MaxLength(40, { message: MESSAGE })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/, { message: MESSAGE })
  @IsISO8601({ strict: true }, { message: MESSAGE })
  deadline: string;
}

export class ExtendListingRevisionDeadlineReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description: '현재 기한보다 늦고 현재 시각 이후인 연장 기한. 시간대 필수',
    example: '2026-12-10T23:59:59+09:00',
  })
  @IsString({ message: MESSAGE })
  @MaxLength(40, { message: MESSAGE })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/, { message: MESSAGE })
  @IsISO8601({ strict: true }, { message: MESSAGE })
  deadline: string;
}
