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
  MaxLength,
  Min,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
} from '../../../../generated/prisma/client.js';
import {
  ADMIN_ACTIVITY_LOG_MAX_PAGE_SIZE,
  ADMIN_ACTIVITY_LOG_PAGE_SIZE,
} from '../../admin-activity-logs.constants.js';

/** 시간대가 붙은 ISO 8601 일시. 예) 2026-09-01T00:00:00+09:00 */
const DATETIME_FORMAT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DATETIME_MESSAGE =
  '작업 기간은 시간대를 포함한 일시로 입력해 주세요. 예) 2026-09-01T00:00:00+09:00';

export class GetAdminActivityLogsReqDto {
  @ApiPropertyOptional({
    description: '관리자 아이디 (일부만 입력해도 된다)',
    example: 'admin01',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(20, { message: '관리자 아이디는 20자 이내로 입력해 주세요.' })
  adminLoginId?: string;

  @ApiPropertyOptional({
    description: '작업 대상',
    enum: AdminActivityTarget,
  })
  @IsOptional()
  @IsEnum(AdminActivityTarget, { message: INVALID_REQUEST_MESSAGE })
  targetType?: AdminActivityTarget;

  @ApiPropertyOptional({
    description:
      '대상 ID. 상품 상세의 변경 이력처럼 한 대상의 기록만 볼 때 targetType과 함께 보낸다.',
    example: 18,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  targetId?: number;

  @ApiPropertyOptional({
    description:
      '수행 작업. targetType을 함께 보내면 그 대상에서 할 수 있는 작업이어야 한다.',
    enum: AdminActivityAction,
  })
  @IsOptional()
  @IsEnum(AdminActivityAction, { message: INVALID_REQUEST_MESSAGE })
  action?: AdminActivityAction;

  @ApiPropertyOptional({
    description: '작업 기간 시작 (포함). 비우면 처음부터',
    example: '2026-09-01T00:00:00+09:00',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: DATETIME_MESSAGE })
  @Matches(DATETIME_FORMAT, { message: DATETIME_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description: '작업 기간 끝 (포함하지 않음). 비우면 지금까지',
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
    description: `한 페이지 건수 (최대 ${ADMIN_ACTIVITY_LOG_MAX_PAGE_SIZE})`,
    default: ADMIN_ACTIVITY_LOG_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(ADMIN_ACTIVITY_LOG_MAX_PAGE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = ADMIN_ACTIVITY_LOG_PAGE_SIZE;
}
