import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import {
  AnomalyStatus,
  AnomalyType,
} from '../../../../generated/prisma/client.js';
import {
  ANOMALY_MAX_PAGE_SIZE,
  ANOMALY_PAGE_SIZE,
} from '../../anomalies.constants.js';

/** 시간대가 붙은 ISO 8601 일시. 예) 2026-09-01T00:00:00+09:00 */
const DATETIME_FORMAT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DATETIME_MESSAGE =
  '발생 기간은 시간대를 포함한 일시로 입력해 주세요. 예) 2026-09-01T00:00:00+09:00';

/** 상품 ID(PRD-018) 또는 회원 ID(USR-1024). 접두어 없이 숫자만 보내면 둘 다 찾는다. */
export const ANOMALY_TARGET_KEYWORD = /^(?:(PRD|USR)-)?0*(\d{1,9})$/i;

export class GetAnomaliesReqDto {
  @ApiPropertyOptional({ description: '탐지 유형', enum: AnomalyType })
  @IsOptional()
  @IsEnum(AnomalyType, { message: INVALID_REQUEST_MESSAGE })
  type?: AnomalyType;

  @ApiPropertyOptional({
    description:
      '처리 상태 (PENDING 미처리, REVIEWING 확인중, RESOLVED 처리완료)',
    enum: AnomalyStatus,
  })
  @IsOptional()
  @IsEnum(AnomalyStatus, { message: INVALID_REQUEST_MESSAGE })
  status?: AnomalyStatus;

  @ApiPropertyOptional({
    description:
      '상품 ID(PRD-018) 또는 회원 ID(USR-1024). 숫자만 보내면 상품 ID와 회원 ID를 모두 찾는다.',
    example: 'PRD-018',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @Matches(ANOMALY_TARGET_KEYWORD, {
    message: '상품 ID 또는 회원 ID로 입력해 주세요. 예) PRD-018, USR-1024',
  })
  keyword?: string;

  @ApiPropertyOptional({
    description: '발생 기간 시작 (포함). 비우면 처음부터',
    example: '2026-09-01T00:00:00+09:00',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATETIME_MESSAGE })
  @Matches(DATETIME_FORMAT, { message: DATETIME_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description: '발생 기간 끝 (포함하지 않음). 비우면 지금까지',
    example: '2026-09-04T00:00:00+09:00',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATETIME_MESSAGE })
  @Matches(DATETIME_FORMAT, { message: DATETIME_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ description: '페이지 (1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({
    description: `한 페이지 건수 (최대 ${ANOMALY_MAX_PAGE_SIZE})`,
    default: ANOMALY_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(ANOMALY_MAX_PAGE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = ANOMALY_PAGE_SIZE;
}
