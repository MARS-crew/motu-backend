import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { LOGIN_ID_MESSAGE, LOGIN_ID_PATTERN } from '../../users.constants.js';

export class CheckLoginIdReqDto {
  @ApiProperty({
    description: '아이디 (5~20자 영문 소문자·숫자)',
    example: 'motu01',
  })
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId: string;
}
