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
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { UserStatus } from '../../../../generated/prisma/client.js';
import {
  ADMIN_USER_MAX_PAGE_SIZE,
  ADMIN_USER_PAGE_SIZE,
} from '../../users.constants.js';

const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class GetAdminUsersReqDto {
  @ApiPropertyOptional({
    description: '아이디 (일부만 입력해도 된다)',
    example: 'sunjung',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(20, { message: '아이디는 20자 이내로 입력해 주세요.' })
  loginId?: string;

  @ApiPropertyOptional({
    description: '닉네임 (일부만 입력해도 된다)',
    example: '선정',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(10, { message: '닉네임은 10자 이내로 입력해 주세요.' })
  nickname?: string;

  @ApiPropertyOptional({
    description:
      '회원 상태 (ACTIVE 정상, LOCKED 잠금, BLOCKED 정지). 비우면 전체',
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: INVALID_REQUEST_MESSAGE })
  status?: UserStatus;

  @ApiPropertyOptional({ description: '페이지 (1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  page: number = 1;

  @ApiPropertyOptional({
    description: `한 페이지 건수 (최대 ${ADMIN_USER_MAX_PAGE_SIZE})`,
    default: ADMIN_USER_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  @Max(ADMIN_USER_MAX_PAGE_SIZE, { message: INVALID_REQUEST_MESSAGE })
  size: number = ADMIN_USER_PAGE_SIZE;
}
