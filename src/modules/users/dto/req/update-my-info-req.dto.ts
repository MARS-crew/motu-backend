import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, Matches, ValidateIf } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_PATTERN } from '../../users.constants.js';
import { IsNotFutureDate } from './create-user-req.dto.js';

/** 회원정보 수정(USR-MY-03). 바꿀 항목만 보낸다. 하나 이상 있어야 한다. */
export class UpdateMyInfoReqDto {
  @ApiPropertyOptional({
    description:
      '새 비밀번호 (8~20자, 영문·숫자·특수문자 각 1개 이상). 현재 비밀번호와 같으면 400 USER_SAME_PASSWORD. 바꾸면 모든 기기에서 로그아웃된다.',
    example: 'motunew1!',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password?: string;

  @ApiPropertyOptional({
    description: '생년월일 (YYYY-MM-DD, 오늘 이후 불가)',
    example: '2000-01-01',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString(
    { strict: true },
    { message: '생년월일 형식이 올바르지 않습니다.' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.',
  })
  @IsNotFutureDate('생년월일은 오늘 이후 날짜로 입력할 수 없습니다.')
  birthDate?: string;
}
