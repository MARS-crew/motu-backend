import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  LOGIN_ID_MESSAGE,
  LOGIN_ID_PATTERN,
  normalizeEmail,
} from '../../../users/users.constants.js';
import {
  ADMIN_DUTY_MAX_LENGTH,
  ADMIN_NAME_MAX_LENGTH,
} from '../../admin-accounts.constants.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAdminAccountReqDto {
  @ApiProperty({
    description: '관리자 아이디 (5~20자 영문 소문자·숫자)',
    example: 'admin04',
  })
  @IsString({ message: LOGIN_ID_MESSAGE })
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId: string;

  @ApiProperty({
    description: `관리자명 (1~${ADMIN_NAME_MAX_LENGTH}자). 동명이인을 허용한다.`,
    example: '최운영',
  })
  @Transform(trim)
  @IsString({ message: '관리자명을 입력해 주세요.' })
  @Length(1, ADMIN_NAME_MAX_LENGTH, {
    message: `관리자명은 1~${ADMIN_NAME_MAX_LENGTH}자로 입력해 주세요.`,
  })
  name: string;

  @ApiProperty({
    description: '이메일. 임시 비밀번호를 이 주소로 보낸다.',
    example: 'admin04@motu.app',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255, { message: '이메일 형식이 올바르지 않습니다.' })
  email: string;

  @ApiPropertyOptional({
    description: `담당 업무 (참고값, ${ADMIN_DUTY_MAX_LENGTH}자 이내). 권한과 관계없다.`,
    example: '상장 심사',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: '담당 업무를 확인해 주세요.' })
  @MaxLength(ADMIN_DUTY_MAX_LENGTH, {
    message: `담당 업무는 ${ADMIN_DUTY_MAX_LENGTH}자 이내로 입력해 주세요.`,
  })
  duty?: string;
}
